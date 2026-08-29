"""
Pydantic schemas for Company domain.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CompanyProfileBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    website: str | None = None
    logo_url: str | None = None
    description: str | None = None
    industry: str | None = Field(None, max_length=255)
    company_size: str | None = Field(None, max_length=50)
    location: str | None = Field(None, max_length=255)
    country: str | None = None
    hiring_status: str | None = "actively_hiring"
    tech_stack: list[str] = []


class CompanyProfileCreate(CompanyProfileBase):
    pass


class CompanyProfileUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    website: str | None = None
    logo_url: str | None = None
    description: str | None = None
    industry: str | None = None
    company_size: str | None = None
    location: str | None = None
    country: str | None = None
    hiring_status: str | None = None
    tech_stack: list[str] | None = None


class CompanyProfileResponse(CompanyProfileBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    is_verified: bool
    created_at: datetime
    updated_at: datetime
