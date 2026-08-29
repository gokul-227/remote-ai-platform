"""
Pydantic schemas for AI Matching domain.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.domains.engineers.schemas import EngineerProfileResponse
from app.domains.jobs.schemas import JobPostResponse


class JobMatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    engineer_id: uuid.UUID
    job_id: uuid.UUID
    overall_score: float
    skill_score: float
    experience_score: float
    role_score: float
    timezone_score: float
    availability_score: float
    compensation_score: float
    remote_score: float
    reasoning: str
    matching_skills: list[str]
    missing_skills: list[str]
    status: str
    created_at: datetime
    updated_at: datetime

    job: JobPostResponse | None = None
    engineer: EngineerProfileResponse | None = None


class MatchStatusUpdate(BaseModel):
    status: str  # recommended, saved, applied, dismissed
