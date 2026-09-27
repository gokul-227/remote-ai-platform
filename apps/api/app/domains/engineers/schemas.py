"""
Pydantic schemas for Engineer Profile domain.
"""

import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field

from app.core.schemas import HttpUrlIn


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


class ProjectItemIn(ProjectItem):
    """ProjectItem as submitted by the user: links must be http(s)."""

    url: HttpUrlIn = None
    github_url: HttpUrlIn = None


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
    projects: Sequence[ProjectItem] = []
    education: list[EducationItem] = []
    is_public: bool = True
    is_open_to_work: bool = True


# Input bounds (the columns' limits); not applied to responses, so stored
# data never fails to serialise.
SkillName = Annotated[str, Field(max_length=100)]


class EngineerProfileCreate(EngineerProfileBase):
    bio: str | None = Field(None, max_length=10_000)
    skills: list[SkillName] = Field(default_factory=list, max_length=100)
    profile_image_url: HttpUrlIn = None
    github_url: HttpUrlIn = None
    linkedin_url: HttpUrlIn = None
    portfolio_url: HttpUrlIn = None
    projects: list[ProjectItemIn] = []
    pass


class EngineerProfileUpdate(BaseModel):
    country: str | None = None
    profile_image_url: HttpUrlIn = None
    headline: str | None = Field(None, max_length=255)
    bio: str | None = Field(None, max_length=10_000)
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
    github_url: HttpUrlIn = None
    linkedin_url: HttpUrlIn = None
    portfolio_url: HttpUrlIn = None
    skills: list[SkillName] | None = Field(None, max_length=100)
    experience: list[ExperienceItem] | None = None
    projects: list[ProjectItemIn] | None = None
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
    search, or by-id lookup. Also omits the owner-facing AI review
    (ai_summary, profile_score, missing_skills, matching_keywords): it is
    coaching for the engineer, not an assessment to publish to others. The
    salary floor is private too; the advertised hourly_rate stays public.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    full_name: str | None = None
    desired_salary_min: float | None = Field(default=None, exclude=True)
    created_at: datetime
    updated_at: datetime


RESUME_UPLOAD_MESSAGES = {
    "parsed": "Resume uploaded. We filled in empty profile fields from it; review and edit them.",
    "failed": "Resume uploaded, but we couldn't read it automatically right now. Fill in your profile by hand.",
    "no_text": "Resume uploaded, but it contains no readable text. Fill in your profile by hand.",
    "quota_exceeded": "Resume uploaded. You've used this month's AI allowance, so fill in your profile by hand.",
}


class ResumeUploadResponse(BaseModel):
    resume_url: str
    # parsed | failed | no_text | quota_exceeded -- upload success is separate from parsing success.
    ai_parse_status: str
    message: str


class EngineerSearchQuery(BaseModel):
    query: str | None = None
    skills: list[str] | None = None
    min_years_exp: int | None = None
    primary_role: str | None = None
    location: str | None = None
    is_open_to_work: bool = True
    skip: int = 0
    limit: int = 20
