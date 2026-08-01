"""
Pydantic schemas for Engineer Profile domain.
"""

import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class ExperienceItem(BaseModel):
    company: str
    title: str
    start_date: str
    end_date: Optional[str] = "Present"
    is_current: bool = False
    description: Optional[str] = None
    technologies: List[str] = []


class ProjectItem(BaseModel):
    title: str
    description: str
    url: Optional[str] = None
    github_url: Optional[str] = None
    technologies: List[str] = []


class EducationItem(BaseModel):
    institution: str
    degree: str
    field_of_study: Optional[str] = None
    start_year: Optional[int] = None
    end_year: Optional[int] = None


class EngineerProfileBase(BaseModel):
    country: Optional[str] = None
    profile_image_url: Optional[str] = None
    headline: Optional[str] = Field(None, max_length=255)
    bio: Optional[str] = None
    location: Optional[str] = Field(None, max_length=255)
    timezone: Optional[str] = None
    availability: Optional[str] = None
    remote_preference: Optional[str] = None
    years_of_experience: int = Field(0, ge=0, le=50)
    primary_role: Optional[str] = Field(None, max_length=255)
    certifications: List[Dict[str, Any]] = []
    previous_companies: List[str] = []
    employment_type: Optional[str] = None
    available_hours: Optional[int] = Field(None, ge=0, le=168)
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    skills: List[str] = []
    experience: List[ExperienceItem] = []
    projects: List[ProjectItem] = []
    education: List[EducationItem] = []
    is_public: bool = True
    is_open_to_work: bool = True


class EngineerProfileCreate(EngineerProfileBase):
    pass


class EngineerProfileUpdate(BaseModel):
    country: Optional[str] = None
    profile_image_url: Optional[str] = None
    headline: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    timezone: Optional[str] = None
    availability: Optional[str] = None
    remote_preference: Optional[str] = None
    years_of_experience: Optional[int] = Field(None, ge=0, le=50)
    primary_role: Optional[str] = None
    certifications: Optional[List[Dict[str, Any]]] = None
    previous_companies: Optional[List[str]] = None
    employment_type: Optional[str] = None
    available_hours: Optional[int] = Field(None, ge=0, le=168)
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    skills: Optional[List[str]] = None
    experience: Optional[List[ExperienceItem]] = None
    projects: Optional[List[ProjectItem]] = None
    education: Optional[List[EducationItem]] = None
    is_public: Optional[bool] = None
    is_open_to_work: Optional[bool] = None


class EngineerProfileResponse(EngineerProfileBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    resume_url: Optional[str] = None
    parsed_resume_data: Optional[Dict[str, Any]] = None
    ai_summary: Optional[str] = None
    profile_score: Optional[float] = None
    missing_skills: List[str] = []
    matching_keywords: List[str] = []
    created_at: datetime
    updated_at: datetime


class ResumeUploadResponse(BaseModel):
    resume_url: str
    message: str = "Resume uploaded successfully. AI parsing queued."


class EngineerSearchQuery(BaseModel):
    query: Optional[str] = None
    skills: Optional[List[str]] = None
    min_years_exp: Optional[int] = None
    primary_role: Optional[str] = None
    location: Optional[str] = None
    is_open_to_work: bool = True
    skip: int = 0
    limit: int = 20
