"""Groups & Communities domain — Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

# ── Group ────────────────────────────────────────────────────────────────────


class GroupCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    description: str | None = None
    category: str = Field(default="general")
    tags: list[str] = Field(default_factory=list)
    is_private: bool = False

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("name must not be blank")
        return v.strip()


class GroupUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=120)
    description: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    is_private: bool | None = None
    avatar_url: str | None = None
    banner_url: str | None = None


class GroupMemberSummary(BaseModel):
    user_id: uuid.UUID
    role: str
    status: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class GroupResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    category: str
    tags: list[str]
    avatar_url: str | None
    banner_url: str | None
    is_private: bool
    is_verified: bool
    member_count: int
    post_count: int
    owner_id: uuid.UUID | None
    created_at: datetime
    # Caller-specific context — injected by router
    is_member: bool = False
    my_role: str | None = None

    model_config = {"from_attributes": True}


class GroupListResponse(BaseModel):
    groups: list[GroupResponse]
    total: int
    page: int
    page_size: int


# ── Membership ───────────────────────────────────────────────────────────────


class MembershipResponse(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    status: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class MemberRoleUpdate(BaseModel):
    role: str = Field(..., pattern="^(member|moderator|admin)$")


# ── Group Posts ──────────────────────────────────────────────────────────────


class GroupPostCreate(BaseModel):
    content: str = Field(..., min_length=1)
    media_urls: list[str] = Field(default_factory=list)


class GroupPostResponse(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    author_id: uuid.UUID
    content: str
    media_urls: list[str]
    like_count: int
    comment_count: int
    is_pinned: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GroupPostListResponse(BaseModel):
    posts: list[GroupPostResponse]
    total: int
    page: int
    page_size: int
