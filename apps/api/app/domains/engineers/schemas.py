"""
Pydantic schemas for Engineer Profile domain.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ExperienceItem(BaseModel):
    company: str
    title: str
    start_date: str
    end_date: str | None = "Present"
    is_current: bool = False
    description: str | None = None
    technologies: list[str] = []


class ProjectItem(BaseModel):
    title: str
    description: str
    url: str | None = None
    github_url: str | None = None
    technologies: list[str] = []


class EducationItem(BaseModel):
    institution: str
    degree: str
    field_of_study: str | None = None
    start_year: int | None = None
    end_year: int | None = None


class EngineerProfileBase(BaseModel):
    country: str | None = None
    profile_image_url: str | None = None
    headline: str | None = Field(None, max_length=255)
    bio: str | None = None
    location: str | None = Field(None, max_length=255)
    timezone: str | None = None
    availability: str | None = None
    remote_preference: str | None = None
    years_of_experience: int = Field(0, ge=0, le=50)
    primary_role: str | None = Field(None, max_length=255)
    certifications: list[dict[str, Any]] = []
    previous_companies: list[str] = []
    employment_type: str | None = None
    available_hours: int | None = Field(None, ge=0, le=168)
    hourly_rate: float | None = Field(None, ge=0)
    desired_salary_min: float | None = Field(None, ge=0)
    languages: list[str] = []
    github_url: str | None = None
    linkedin_url: str | None = None
    portfolio_url: str | None = None
    skills: list[str] = []
    experience: list[ExperienceItem] = []
    projects: list[ProjectItem] = []
    education: list[EducationItem] = []
    is_public: bool = True
    is_open_to_work: bool = True


class EngineerProfileCreate(EngineerProfileBase):
    pass


class EngineerProfileUpdate(BaseModel):
    country: str | None = None
    profile_image_url: str | None = None
    headline: str | None = None
    bio: str | None = None
    location: str | None = None
    timezone: str | None = None
    availability: str | None = None
    remote_preference: str | None = None
    years_of_experience: int | None = Field(None, ge=0, le=50)
    primary_role: str | None = None
    certifications: list[dict[str, Any]] | None = None
    previous_companies: list[str] | None = None
    employment_type: str | None = None
    available_hours: int | None = Field(None, ge=0, le=168)
    hourly_rate: float | None = Field(None, ge=0)
    desired_salary_min: float | None = Field(None, ge=0)
    languages: list[str] | None = None
    github_url: str | None = None
    linkedin_url: str | None = None
    portfolio_url: str | None = None
    skills: list[str] | None = None
    experience: list[ExperienceItem] | None = None
    projects: list[ProjectItem] | None = None
    education: list[EducationItem] | None = None
    is_public: bool | None = None
    is_open_to_work: bool | None = None


class EngineerProfileResponse(EngineerProfileBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    full_name: str | None = None
    resume_url: str | None = None
    parsed_resume_data: dict[str, Any] | None = None
    ai_summary: str | None = None
    profile_score: float | None = None
    missing_skills: list[str] = []
    matching_keywords: list[str] = []
    created_at: datetime
    updated_at: datetime


class EngineerPublicProfileResponse(EngineerProfileBase):
    """Response for endpoints reachable by other users/anonymous callers.

    Deliberately omits resume_url and parsed_resume_data — those are private
    to the profile owner and must never be serialized to a public listing,
    search, or by-id lookup.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    full_name: str | None = None
    ai_summary: str | None = None
    profile_score: float | None = None
    missing_skills: list[str] = []
    matching_keywords: list[str] = []
    created_at: datetime
    updated_at: datetime


class ResumeUploadResponse(BaseModel):
    resume_url: str
    message: str = "Resume uploaded successfully. AI parsing queued."


class EngineerSearchQuery(BaseModel):
    query: str | None = None
    skills: list[str] | None = None
    min_years_exp: int | None = None
    primary_role: str | None = None
    location: str | None = None
    is_open_to_work: bool = True
    skip: int = 0
    limit: int = 20
