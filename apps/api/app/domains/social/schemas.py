"""Social feed domain Pydantic schemas."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class PostCreate(BaseModel):
    content: str = Field(min_length=1, max_length=3000)
    image_url: Optional[str] = Field(default=None, max_length=2048)
    link_url: Optional[str] = Field(default=None, max_length=2048)
    link_preview_title: Optional[str] = Field(default=None, max_length=255)
    visibility: str = Field(default="PUBLIC", pattern="^(PUBLIC|CONNECTIONS|PRIVATE)$")


class PostUpdate(BaseModel):
    content: Optional[str] = Field(default=None, min_length=1, max_length=3000)
    visibility: Optional[str] = Field(default=None, pattern="^(PUBLIC|CONNECTIONS|PRIVATE)$")


class AuthorSummary(BaseModel):
    id: uuid.UUID
    full_name: str
    avatar_url: Optional[str] = None
    role: str

    model_config = {"from_attributes": True}


class CommentResponse(BaseModel):
    id: uuid.UUID
    post_id: uuid.UUID
    author_id: uuid.UUID
    author: Optional[AuthorSummary] = None
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PostResponse(BaseModel):
    id: uuid.UUID
    author_id: uuid.UUID
    author: Optional[AuthorSummary] = None
    content: str
    image_url: Optional[str] = None
    link_url: Optional[str] = None
    link_preview_title: Optional[str] = None
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
