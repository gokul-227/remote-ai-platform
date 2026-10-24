"""Deliverables request/response schemas."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domains.deliverables.validation import (
    normalize_commit_sha,
    validate_branch,
    validate_demo_url,
    validate_repo_url,
)


class CodeDeliverableCreate(BaseModel):
    milestone_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=10_000)
    repo_url: str
    branch: str | None = None
    commit_sha: str
    supersedes_id: uuid.UUID | None = None

    _repo = field_validator("repo_url")(lambda cls, v: validate_repo_url(v))
    _branch = field_validator("branch")(lambda cls, v: validate_branch(v))
    _sha = field_validator("commit_sha")(lambda cls, v: normalize_commit_sha(v))


class DemoDeliverableCreate(BaseModel):
    milestone_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=10_000)
    demo_url: str
    environment: str | None = Field(default=None, max_length=50)
    supersedes_id: uuid.UUID | None = None

    _demo = field_validator("demo_url")(lambda cls, v: validate_demo_url(v))


class DeliverableReview(BaseModel):
    decision: Literal["ACCEPTED", "CHANGES_REQUESTED"]
    note: str | None = Field(default=None, max_length=10_000)


class DeliverableResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    contract_id: uuid.UUID
    milestone_id: uuid.UUID
    submitted_by_id: uuid.UUID
    supersedes_id: uuid.UUID | None
    kind: str
    title: str
    notes: str | None
    version: int
    status: str
    review_note: str | None
    reviewed_at: datetime | None
    repo_url: str | None
    branch: str | None
    commit_sha: str | None
    file_name: str | None
    file_mime: str | None
    file_size: int | None
    demo_url: str | None
    environment: str | None
    created_at: datetime


class DownloadLink(BaseModel):
    url: str
    expires_in_seconds: int
    file_name: str
