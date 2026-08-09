"""
Pydantic schemas for Job Post domain.
"""

import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field


class JobPostBase(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    description: str
    # Optional at the request layer: company-posted jobs have this derived
    # server-side from the caller's CompanyProfile (see jobs/router.py create_job).
    # Aggregator/demo-seeded jobs always pass it explicitly. JobService.create_job
    # rejects a request where it's still missing after that derivation.
    company_name: Optional[str] = Field(None, max_length=255)
    company_logo: Optional[str] = None
    location: Optional[str] = "Remote"
    is_remote: bool = True
    job_type: str = "full-time"
    experience_level: Optional[str] = "mid"
    budget_min: Optional[float] = Field(None, ge=0)
    budget_max: Optional[float] = Field(None, ge=0)
    timeline: Optional[str] = None
    remote_preference: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    currency: str = "USD"
    skills: List[str] = []
    external_url: Optional[str] = None
    ai_analysis: Optional[Dict[str, Any]] = None


class JobPostCreate(JobPostBase):
    company_id: Optional[uuid.UUID] = None
    external_id: Optional[str] = None
    source: str = "DIRECT"


class JobPostUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    company_name: Optional[str] = None
    company_logo: Optional[str] = None
    location: Optional[str] = None
    is_remote: Optional[bool] = None
    job_type: Optional[str] = None
    experience_level: Optional[str] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    timeline: Optional[str] = None
    remote_preference: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    currency: Optional[str] = None
    skills: Optional[List[str]] = None
    external_url: Optional[str] = None
    is_active: Optional[bool] = None


class JobPostResponse(JobPostBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: Optional[uuid.UUID] = None
    slug: str
    external_id: Optional[str] = None
    source: str
    is_active: bool
    posted_at: datetime
    created_at: datetime
    updated_at: datetime
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    timeline: Optional[str] = None
    remote_preference: Optional[str] = None
    ai_analysis: Optional[Dict[str, Any]] = None


class JobSearchQuery(BaseModel):
    query: Optional[str] = None
    skills: Optional[List[str]] = None
    is_remote: bool = True
    job_type: Optional[str] = None
    experience_level: Optional[str] = None
    min_salary: Optional[float] = None
    max_salary: Optional[float] = None
    source: Optional[str] = None
    company_id: Optional[uuid.UUID] = None
    skip: int = 0
    limit: int = 20
