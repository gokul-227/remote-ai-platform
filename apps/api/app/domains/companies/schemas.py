"""
Pydantic schemas for Company domain.
"""

import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


class CompanyProfileBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    website: Optional[str] = None
    logo_url: Optional[str] = None
    description: Optional[str] = None
    industry: Optional[str] = Field(None, max_length=255)
    company_size: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=255)
    country: Optional[str] = None
    hiring_status: Optional[str] = "actively_hiring"
    tech_stack: List[str] = []


class CompanyProfileCreate(CompanyProfileBase):
    pass


class CompanyProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    website: Optional[str] = None
    logo_url: Optional[str] = None
    description: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    location: Optional[str] = None
    country: Optional[str] = None
    hiring_status: Optional[str] = None
    tech_stack: Optional[List[str]] = None


class CompanyProfileResponse(CompanyProfileBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    is_verified: bool
    created_at: datetime
    updated_at: datetime
