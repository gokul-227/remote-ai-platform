"""
Who may do what with a file node.

`effective_role(db, node, user)` returns "owner", "editor", "commenter", "viewer"
or None, following folder inheritance: a share on any ancestor applies to the
node, the broadest role wins. Principals are the user, the projects they are a
member of, and the organisations they belong to. Link tokens are resolved
separately (`role_for_link`), never through a signed-in principal.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User
from app.domains.companies.access import companies_for
from app.domains.files.models import ROLE_RANK, FileNode, FileShare
from app.domains.projects.models import Project, ProjectMember

MAX_DEPTH = 64


async def ancestors(db: AsyncSession, node: FileNode) -> list[FileNode]:
    """The node itself followed by its parents up to the root."""
    chain = [node]
    current = node
    for _ in range(MAX_DEPTH):
        if current.parent_id is None:
            break
        parent = await db.get(FileNode, current.parent_id)
        if parent is None:
            break
        chain.append(parent)
        current = parent
    return chain


async def principals_for(db: AsyncSession, user: User) -> dict[str, set[uuid.UUID]]:
    project_ids = set(
        (
            await db.execute(
                select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
            )
        ).scalars()
    )
    org_ids = {c.id for c in await companies_for(db, user)}
    # Projects owned by the user's organisations are theirs too.
    if org_ids:
        owned_projects = (
            await db.execute(
                select(Project.id).where(
                    Project.company_id.in_(org_ids), Project.is_deleted.is_(False)
                )
            )
        ).scalars()
        project_ids |= set(owned_projects)
    return {"user": {user.id}, "project": project_ids, "organisation": org_ids}


def _fresh(share: FileShare, now: datetime) -> bool:
    if share.expires_at is None:
        return True
    exp = share.expires_at if share.expires_at.tzinfo else share.expires_at.replace(tzinfo=UTC)
    return exp > now


async def effective_role(db: AsyncSession, node: FileNode, user: User | None) -> str | None:
    if user is None:
        return None
    chain = await ancestors(db, node)
    if any(n.owner_id == user.id for n in chain):
        return "owner"
    principals = await principals_for(db, user)
    # Space membership grants viewer access to project / organisation roots.
    best = 0
    for n in chain:
        if n.project_id is not None and n.project_id in principals["project"]:
            best = max(best, ROLE_RANK["editor"])
        if n.company_id is not None and n.company_id in principals["organisation"]:
            best = max(best, ROLE_RANK["editor"])
    node_ids = [n.id for n in chain]
    shares = (
        (
            await db.execute(
                select(FileShare).where(
                    FileShare.node_id.in_(node_ids), FileShare.principal_type != "link"
                )
            )
        )
        .scalars()
        .all()
    )
    now = datetime.now(UTC)
    for share in shares:
        if not _fresh(share, now):
            continue
        if share.principal_id in principals.get(share.principal_type, set()):
            best = max(best, ROLE_RANK.get(share.role, 0))
    for name, rank in ROLE_RANK.items():
        if rank == best:
            return name
    return None


async def role_for_link(db: AsyncSession, node: FileNode, token: str) -> str | None:
    chain = await ancestors(db, node)
    share = (
        await db.execute(
            select(FileShare).where(
                FileShare.token == token,
                FileShare.principal_type == "link",
                FileShare.node_id.in_([n.id for n in chain]),
            )
        )
    ).scalar_one_or_none()
    if share is None or not _fresh(share, datetime.now(UTC)):
        return None
    return share.role


def can(role: str | None, needed: str) -> bool:
    return role is not None and ROLE_RANK.get(role, 0) >= ROLE_RANK[needed]
