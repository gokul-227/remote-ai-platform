"""
Pydantic schemas for Job Post domain.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class JobPostBase(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    description: str
    # Optional at the request layer: company-posted jobs have this derived
    # server-side from the caller's CompanyProfile (see jobs/router.py create_job).
    # Aggregator/demo-seeded jobs always pass it explicitly. JobService.create_job
    # rejects a request where it's still missing after that derivation.
    company_name: str | None = Field(default=None, max_length=255)
    company_logo: str | None = None
    location: str | None = "Remote"
    is_remote: bool = True
    job_type: str = "full-time"
    experience_level: str | None = "mid"
    budget_min: float | None = Field(default=None, ge=0)
    budget_max: float | None = Field(default=None, ge=0)
    timeline: str | None = None
    remote_preference: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    currency: str = "USD"
    skills: list[str] = []
    external_url: str | None = None
    ai_analysis: dict[str, Any] | None = None


class JobPostCreate(JobPostBase):
    company_id: uuid.UUID | None = None
    external_id: str | None = None
    source: str = "DIRECT"


class JobPostUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    company_name: str | None = None
    company_logo: str | None = None
    location: str | None = None
    is_remote: bool | None = None
    job_type: str | None = None
    experience_level: str | None = None
    budget_min: float | None = None
    budget_max: float | None = None
    timeline: str | None = None
    remote_preference: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    currency: str | None = None
    skills: list[str] | None = None
    external_url: str | None = None
    is_active: bool | None = None


class JobPostResponse(JobPostBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID | None = None
    slug: str
    external_id: str | None = None
    source: str
    is_active: bool
    posted_at: datetime
    created_at: datetime
    updated_at: datetime
    budget_min: float | None = None
    budget_max: float | None = None
    timeline: str | None = None
    remote_preference: str | None = None
    ai_analysis: dict[str, Any] | None = None


class JobSearchQuery(BaseModel):
    query: str | None = None
    skills: list[str] | None = None
    is_remote: bool = True
    job_type: str | None = None
    experience_level: str | None = None
    min_salary: float | None = None
    max_salary: float | None = None
    source: str | None = None
    company_id: uuid.UUID | None = None
    skip: int = 0
    limit: int = 20
