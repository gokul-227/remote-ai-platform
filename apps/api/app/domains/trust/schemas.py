"""Trust & Reputation domain Pydantic schemas."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TrustScoreResponse(BaseModel):
    user_id: uuid.UUID
    overall_score: float = Field(ge=0, le=100)
    completion_rate: float = Field(ge=0, le=100)
    on_time_rate: float = Field(ge=0, le=100)
    rating_avg: float = Field(ge=0, le=5)
    review_count: int = Field(ge=0)
    verified_skills_count: int = Field(ge=0)
    score_breakdown: dict[str, Any] = Field(default_factory=dict)
    updated_at: datetime

    model_config = {"from_attributes": True}


class VerificationCreate(BaseModel):
    verification_type: str = Field(pattern="^(IDENTITY|GITHUB|LINKEDIN|SKILL_ASSESSMENT)$")
    verifier_notes: str | None = None


class VerificationReviewUpdate(BaseModel):
    status: str = Field(pattern="^(VERIFIED|REJECTED)$")
    verifier_notes: str | None = None


class VerificationResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    verification_type: str
    status: str
    verifier_notes: str | None = None
    verified_at: datetime | None = None
    reviewed_by_id: uuid.UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ReviewCreate(BaseModel):
    project_id: uuid.UUID
    reviewee_id: uuid.UUID
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=1, max_length=2000)


class ReviewerSummary(BaseModel):
    id: uuid.UUID
    full_name: str
    role: str

    model_config = {"from_attributes": True}


class ProjectReviewResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    reviewer_id: uuid.UUID
    reviewee_id: uuid.UUID
    reviewer: ReviewerSummary | None = None
    rating: int
    comment: str
    created_at: datetime

    model_config = {"from_attributes": True}
