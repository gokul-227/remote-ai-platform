"""
Pydantic schemas for AI Matching domain.
"""

import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

from app.domains.jobs.schemas import JobPostResponse
from app.domains.engineers.schemas import EngineerProfileResponse


class JobMatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    engineer_id: uuid.UUID
    job_id: uuid.UUID
    overall_score: float
    skill_score: float
    experience_score: float
    role_score: float
    reasoning: str
    matching_skills: List[str]
    missing_skills: List[str]
    status: str
    created_at: datetime
    updated_at: datetime

    job: Optional[JobPostResponse] = None
    engineer: Optional[EngineerProfileResponse] = None


class MatchStatusUpdate(BaseModel):
    status: str  # recommended, saved, applied, dismissed
