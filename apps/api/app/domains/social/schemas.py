"""Social feed domain Pydantic schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class PostCreate(BaseModel):
    content: str = Field(min_length=1, max_length=3000)
    image_url: str | None = Field(default=None, max_length=2048)
    link_url: str | None = Field(default=None, max_length=2048)
    link_preview_title: str | None = Field(default=None, max_length=255)
    visibility: str = Field(default="PUBLIC", pattern="^(PUBLIC|CONNECTIONS|PRIVATE)$")


class PostUpdate(BaseModel):
    content: str | None = Field(default=None, min_length=1, max_length=3000)
    visibility: str | None = Field(default=None, pattern="^(PUBLIC|CONNECTIONS|PRIVATE)$")


class AuthorSummary(BaseModel):
    id: uuid.UUID
    full_name: str
    avatar_url: str | None = None
    role: str

    model_config = {"from_attributes": True}


class CommentResponse(BaseModel):
    id: uuid.UUID
    post_id: uuid.UUID
    author_id: uuid.UUID
    author: AuthorSummary | None = None
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PostResponse(BaseModel):
    id: uuid.UUID
    author_id: uuid.UUID
    author: AuthorSummary | None = None
    content: str
    image_url: str | None = None
    link_url: str | None = None
    link_preview_title: str | None = None
    visibility: str
    like_count: int
    comment_count: int
    liked_by_me: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=1000)


class FeedResponse(BaseModel):
    posts: list[PostResponse]
    total: int
    page: int
    page_size: int
    has_more: bool
