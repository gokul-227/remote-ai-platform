"""
Unified search.

One query, typed result groups, every group filtered by what the caller may see:

- jobs           public listings (anyone)
- people         public professional profiles (anyone)
- organisations  organisation pages (anyone)
- projects       projects the caller owns (organisation) or is a member of
- documents      documents the caller owns, is shared on, or that belong to their projects
- channels       channels the caller is an active member of (name/topic; message bodies via the
                 channel's own permission-checked search)

Matching is case-insensitive substring (`ILIKE`); on PostgreSQL the trigram GIN
indexes from migration 060 make those scans cheap. Signed-out callers only get
the public groups. Literal `%` and `_` in the query are escaped.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_optional_user
from app.domains.auth.models import User
from app.domains.channels.models import Channel, ChannelMember
from app.domains.companies.access import companies_for
from app.domains.companies.models import CompanyProfile
from app.domains.companies.schemas import CompanyProfileResponse
from app.domains.documents.models import Document, DocumentShare
from app.domains.engineers.repository import EngineerRepository
from app.domains.engineers.schemas import EngineerPublicProfileResponse
from app.domains.jobs.repository import JobRepository
from app.domains.jobs.schemas import JobPostResponse
from app.domains.projects.models import Project, ProjectMember

router = APIRouter(prefix="/search", tags=["Global Search"])

PRIVATE_GROUPS = ("projects", "documents", "channels")


class SearchHit(BaseModel):
    id: uuid.UUID
    title: str
    subtitle: str | None = None
    route: str


class GlobalSearchResponse(BaseModel):
    query: str
    total_jobs: int
    total_engineers: int
    total_companies: int = 0
    total_projects: int = 0
    total_documents: int = 0
    total_channels: int = 0
    jobs: list[JobPostResponse]
    engineers: list[EngineerPublicProfileResponse]
    companies: list[CompanyProfileResponse] = []
    projects: list[SearchHit] = []
    documents: list[SearchHit] = []
    channels: list[SearchHit] = []
    signed_in: bool = False


def _pattern(q: str) -> str:
    escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


async def _projects(db: AsyncSession, user: User, pattern: str, limit: int) -> list[SearchHit]:
    orgs = await companies_for(db, user)
    org_ids = [c.id for c in orgs]
    member_ids = select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
    access = [Project.id.in_(member_ids)]
    if org_ids:
        access.append(Project.company_id.in_(org_ids))
    rows = (
        (
            await db.execute(
                select(Project)
                .where(
                    Project.is_deleted.is_(False),
                    or_(*access),
                    or_(
                        Project.title.ilike(pattern, escape="\\"),
                        Project.description.ilike(pattern, escape="\\"),
                    ),
                )
                .order_by(Project.title)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return [
        SearchHit(id=p.id, title=p.title, subtitle=p.status, route=f"#project/{p.id}") for p in rows
    ]


async def _documents(db: AsyncSession, user: User, pattern: str, limit: int) -> list[SearchHit]:
    shared_ids = select(DocumentShare.document_id).where(DocumentShare.user_id == user.id)
    project_ids = select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
    rows = (
        (
            await db.execute(
                select(Document)
                .where(
                    or_(
                        Document.owner_id == user.id,
                        Document.id.in_(shared_ids),
                        Document.project_id.in_(project_ids),
                    ),
                    Document.title.ilike(pattern, escape="\\"),
                )
                .order_by(Document.title)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    route_for = {"doc": "docs", "sheet": "sheets", "slides": "slides"}
    return [
        SearchHit(
            id=d.id,
            title=d.title,
            subtitle=d.kind,
            route=f"#{route_for.get(d.kind, 'docs')}/{d.id}",
        )
        for d in rows
    ]


async def _channels(db: AsyncSession, user: User, pattern: str, limit: int) -> list[SearchHit]:
    rows = (
        (
            await db.execute(
                select(Channel)
                .join(ChannelMember, ChannelMember.channel_id == Channel.id)
                .where(
                    ChannelMember.user_id == user.id,
                    ChannelMember.active.is_(True),
                    Channel.archived.is_(False),
                    or_(
                        Channel.name.ilike(pattern, escape="\\"),
                        Channel.topic.ilike(pattern, escape="\\"),
                    ),
                )
                .order_by(Channel.name)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return [
        SearchHit(id=c.id, title=c.name, subtitle=c.topic, route=f"#channels/{c.id}") for c in rows
    ]


@router.get("", response_model=GlobalSearchResponse)
async def global_search(
    q: str = Query(..., min_length=1, max_length=120, description="Keywords"),
    is_remote: bool = Query(True),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=50),
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> GlobalSearchResponse:
    """Unified search across public jobs, people and organisations, plus the caller's
    own projects, documents and channels when signed in."""
    job_repo = JobRepository(db)
    engineer_repo = EngineerRepository(db)
    pattern = _pattern(q)

    jobs = await job_repo.search(query=q, is_remote=is_remote, skip=skip, limit=limit)
    engineers = await engineer_repo.search(query=q, skip=skip, limit=limit)
    companies = (
        (
            await db.execute(
                select(CompanyProfile)
                .where(
                    or_(
                        CompanyProfile.name.ilike(pattern, escape="\\"),
                        CompanyProfile.industry.ilike(pattern, escape="\\"),
                        CompanyProfile.location.ilike(pattern, escape="\\"),
                    )
                )
                .order_by(CompanyProfile.is_verified.desc(), CompanyProfile.name)
                .offset(skip)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )

    private: dict[str, list[SearchHit]] = {g: [] for g in PRIVATE_GROUPS}
    if user is not None:
        private["projects"] = await _projects(db, user, pattern, limit)
        private["documents"] = await _documents(db, user, pattern, limit)
        private["channels"] = await _channels(db, user, pattern, limit)

    payload: dict[str, Any] = {
        "query": q,
        "total_jobs": len(jobs),
        "total_engineers": len(engineers),
        "total_companies": len(companies),
        "jobs": [JobPostResponse.model_validate(j) for j in jobs],
        "engineers": [EngineerPublicProfileResponse.model_validate(e) for e in engineers],
        "companies": [CompanyProfileResponse.model_validate(c) for c in companies],
        "signed_in": user is not None,
    }
    for group in PRIVATE_GROUPS:
        payload[group] = private[group]
        payload[f"total_{group}"] = len(private[group])
    return GlobalSearchResponse(**payload)
