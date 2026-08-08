"""Groups & Communities domain — FastAPI router."""

from __future__ import annotations

import re
import uuid
from math import ceil
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.domains.auth.models import User
from app.domains.groups.models import Group, GroupMembership, GroupPost
from app.domains.groups.schemas import (
    GroupCreate,
    GroupListResponse,
    GroupPostCreate,
    GroupPostListResponse,
    GroupPostResponse,
    GroupResponse,
    GroupUpdate,
    MemberRoleUpdate,
    MembershipResponse,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/groups", tags=["groups"])

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    return _SLUG_RE.sub("-", name.lower()).strip("-")


async def _get_group_or_404(group_id: uuid.UUID, db: AsyncSession) -> Group:
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    return group


async def _get_membership(group_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Optional[GroupMembership]:
    result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


def _enrich(group: Group, membership: Optional[GroupMembership]) -> GroupResponse:
    resp = GroupResponse.model_validate(group)
    if membership and membership.status == "active":
        resp.is_member = True
        resp.my_role = membership.role
    return resp


# ── Groups CRUD ───────────────────────────────────────────────────────────────

@router.get("", response_model=GroupListResponse)
async def list_groups(
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all public groups with optional category/search filters."""
    q = select(Group).where(Group.is_private.is_(False))
    if category:
        q = q.where(Group.category == category)
    if search:
        q = q.where(Group.name.ilike(f"%{search}%"))

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar_one()

    q = q.order_by(Group.member_count.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    groups = result.scalars().all()

    # Batch-fetch memberships for current user
    group_ids = [g.id for g in groups]
    mem_result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id.in_(group_ids),
            GroupMembership.user_id == current_user.id,
        )
    )
    mem_map = {m.group_id: m for m in mem_result.scalars().all()}

    return GroupListResponse(
        groups=[_enrich(g, mem_map.get(g.id)) for g in groups],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    body: GroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new group. The creator becomes the owner and first admin member."""
    base_slug = _slugify(body.name)
    slug = base_slug
    # Ensure unique slug
    counter = 1
    while True:
        exists = await db.execute(select(Group).where(Group.slug == slug))
        if not exists.scalar_one_or_none():
            break
        slug = f"{base_slug}-{counter}"
        counter += 1

    group = Group(
        name=body.name,
        slug=slug,
        description=body.description,
        category=body.category,
        tags=body.tags,
        is_private=body.is_private,
        owner_id=current_user.id,
        member_count=1,
    )
    db.add(group)
    await db.flush()  # get group.id

    membership = GroupMembership(
        group_id=group.id,
        user_id=current_user.id,
        role="admin",
        status="active",
    )
    db.add(membership)
    await db.commit()
    await db.refresh(group)

    logger.info("Group created", group_id=str(group.id), owner=str(current_user.id))
    return _enrich(group, membership)


@router.get("/{group_id}", response_model=GroupResponse)
async def get_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single group by ID."""
    group = await _get_group_or_404(group_id, db)
    membership = await _get_membership(group_id, current_user.id, db)
    if group.is_private and (not membership or membership.status != "active"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This group is private")
    return _enrich(group, membership)


@router.patch("/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: uuid.UUID,
    body: GroupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update group metadata. Requires admin membership or ownership."""
    group = await _get_group_or_404(group_id, db)
    membership = await _get_membership(group_id, current_user.id, db)
    is_admin = membership and membership.role in ("admin",) and membership.status == "active"
    is_owner = group.owner_id == current_user.id
    if not (is_admin or is_owner):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(group, field, value)

    await db.commit()
    await db.refresh(group)
    return _enrich(group, membership)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a group. Only owner or ADMIN role user can delete."""
    group = await _get_group_or_404(group_id, db)
    if group.owner_id != current_user.id and current_user.role.value != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can delete group")
    await db.delete(group)
    await db.commit()


# ── Membership ────────────────────────────────────────────────────────────────

@router.post("/{group_id}/join", response_model=MembershipResponse, status_code=status.HTTP_201_CREATED)
async def join_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Join a group. Private groups create a pending membership."""
    group = await _get_group_or_404(group_id, db)
    existing = await _get_membership(group_id, current_user.id, db)
    if existing:
        if existing.status == "banned":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are banned from this group")
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member")

    membership = GroupMembership(
        group_id=group_id,
        user_id=current_user.id,
        role="member",
        status="pending" if group.is_private else "active",
    )
    db.add(membership)

    if not group.is_private:
        group.member_count = (group.member_count or 0) + 1

    await db.commit()
    await db.refresh(membership)
    return MembershipResponse.model_validate(membership)


@router.post("/{group_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Leave a group."""
    group = await _get_group_or_404(group_id, db)
    membership = await _get_membership(group_id, current_user.id, db)
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not a member")
    if group.owner_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Owner cannot leave. Transfer ownership first.")

    await db.delete(membership)
    if group.member_count > 0:
        group.member_count -= 1
    await db.commit()


@router.get("/{group_id}/members", response_model=list[MembershipResponse])
async def list_members(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all active members of a group."""
    group = await _get_group_or_404(group_id, db)
    membership = await _get_membership(group_id, current_user.id, db)
    if group.is_private and (not membership or membership.status != "active"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Must be a member to view")

    result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id == group_id,
            GroupMembership.status == "active",
        ).order_by(GroupMembership.joined_at)
    )
    return [MembershipResponse.model_validate(m) for m in result.scalars().all()]


@router.patch("/{group_id}/members/{user_id}/role", response_model=MembershipResponse)
async def update_member_role(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    body: MemberRoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Promote or demote a member. Requires admin access."""
    group = await _get_group_or_404(group_id, db)
    caller_mem = await _get_membership(group_id, current_user.id, db)
    if not caller_mem or caller_mem.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    target_mem = await _get_membership(group_id, user_id, db)
    if not target_mem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    target_mem.role = body.role
    await db.commit()
    await db.refresh(target_mem)
    return MembershipResponse.model_validate(target_mem)


# ── My Groups ─────────────────────────────────────────────────────────────────

@router.get("/me/joined", response_model=GroupListResponse)
async def my_groups(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all groups the current user is an active member of."""
    q = (
        select(Group)
        .join(GroupMembership, GroupMembership.group_id == Group.id)
        .where(
            GroupMembership.user_id == current_user.id,
            GroupMembership.status == "active",
        )
    )
    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar_one()

    q = q.order_by(Group.name).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    groups = result.scalars().all()

    mem_result = await db.execute(
        select(GroupMembership).where(
            GroupMembership.group_id.in_([g.id for g in groups]),
            GroupMembership.user_id == current_user.id,
        )
    )
    mem_map = {m.group_id: m for m in mem_result.scalars().all()}

    return GroupListResponse(
        groups=[_enrich(g, mem_map.get(g.id)) for g in groups],
        total=total,
        page=page,
        page_size=page_size,
    )


# ── Group Posts ───────────────────────────────────────────────────────────────

@router.get("/{group_id}/posts", response_model=GroupPostListResponse)
async def list_group_posts(
    group_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List posts in a group. Must be a member to view private group posts."""
    group = await _get_group_or_404(group_id, db)
    membership = await _get_membership(group_id, current_user.id, db)
    if group.is_private and (not membership or membership.status != "active"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Must be a member to view posts")

    q = select(GroupPost).where(GroupPost.group_id == group_id)
    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar_one()

    q = q.order_by(GroupPost.is_pinned.desc(), GroupPost.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    posts = result.scalars().all()

    return GroupPostListResponse(
        posts=[GroupPostResponse.model_validate(p) for p in posts],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/{group_id}/posts", response_model=GroupPostResponse, status_code=status.HTTP_201_CREATED)
async def create_group_post(
    group_id: uuid.UUID,
    body: GroupPostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a post in a group. Must be an active member."""
    group = await _get_group_or_404(group_id, db)
    membership = await _get_membership(group_id, current_user.id, db)
    if not membership or membership.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Must be an active member to post")

    post = GroupPost(
        group_id=group_id,
        author_id=current_user.id,
        content=body.content,
        media_urls=body.media_urls,
    )
    db.add(post)
    group.post_count = (group.post_count or 0) + 1
    await db.commit()
    await db.refresh(post)
    return GroupPostResponse.model_validate(post)


@router.delete("/{group_id}/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group_post(
    group_id: uuid.UUID,
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a group post. Author or group admin can delete."""
    result = await db.execute(select(GroupPost).where(GroupPost.id == post_id, GroupPost.group_id == group_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    membership = await _get_membership(group_id, current_user.id, db)
    is_admin = membership and membership.role in ("admin", "moderator") and membership.status == "active"
    if post.author_id != current_user.id and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    await db.delete(post)

    group = await _get_group_or_404(group_id, db)
    if group.post_count > 0:
        group.post_count -= 1
    await db.commit()
