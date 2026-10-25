"""
Public, sign-in-free reads that back the crawlable pages (/people, /companies,
/posts) and their sitemaps — the way LinkedIn and Facebook let search engines
show profiles and posts while every action (connect, message, apply) needs an
account. Only what members chose to make public appears here: public profiles,
PUBLIC posts, company pages; suspended accounts never do.
"""

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.models import User
from app.domains.companies.models import CompanyProfile
from app.domains.engineers.models import EngineerProfile
from app.domains.social.models import Post

router = APIRouter(prefix="/public", tags=["Public pages"])


class PublicAuthor(BaseModel):
    name: str | None
    headline: str | None = None
    profile_id: uuid.UUID | None = None


class PublicPost(BaseModel):
    id: uuid.UUID
    content: str
    image_url: str | None
    link_url: str | None
    like_count: int
    comment_count: int
    created_at: datetime
    author: PublicAuthor


class SitemapEntry(BaseModel):
    id: uuid.UUID
    updated_at: datetime


@router.get("/posts/{post_id}", response_model=PublicPost)
async def public_post(post_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> PublicPost:
    row = (
        await db.execute(
            select(Post, User, EngineerProfile)
            .join(User, User.id == Post.author_id)
            .outerjoin(EngineerProfile, EngineerProfile.user_id == User.id)
            .where(Post.id == post_id, Post.visibility == "PUBLIC", User.is_active.is_(True))
        )
    ).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    post, user, profile = row
    show_profile = profile is not None and profile.is_public
    return PublicPost(
        id=post.id,
        content=post.content,
        image_url=post.image_url,
        link_url=post.link_url,
        like_count=post.like_count,
        comment_count=post.comment_count,
        created_at=post.created_at,
        author=PublicAuthor(
            name=user.full_name,
            headline=profile.headline if show_profile else None,
            profile_id=profile.id if show_profile else None,
        ),
    )


@router.get("/sitemap-entries", response_model=list[SitemapEntry])
async def sitemap_entries(
    kind: Literal["people", "companies", "posts"],
    skip: int = Query(0, ge=0),
    limit: int = Query(5000, ge=1, le=10000),
    db: AsyncSession = Depends(get_db),
) -> list[SitemapEntry]:
    if kind == "people":
        stmt = (
            select(EngineerProfile.id, EngineerProfile.updated_at)
            .join(User, User.id == EngineerProfile.user_id)
            .where(EngineerProfile.is_public.is_(True), User.is_active.is_(True))
            .order_by(EngineerProfile.created_at, EngineerProfile.id)
        )
    elif kind == "companies":
        stmt = (
            select(CompanyProfile.id, CompanyProfile.updated_at)
            .join(User, User.id == CompanyProfile.user_id)
            .where(User.is_active.is_(True))
            .order_by(CompanyProfile.created_at, CompanyProfile.id)
        )
    else:
        stmt = (
            select(Post.id, Post.updated_at)
            .join(User, User.id == Post.author_id)
            .where(Post.visibility == "PUBLIC", User.is_active.is_(True))
            .order_by(Post.created_at, Post.id)
        )
    rows = (await db.execute(stmt.offset(skip).limit(limit))).all()
    return [SitemapEntry(id=r[0], updated_at=r[1]) for r in rows]
