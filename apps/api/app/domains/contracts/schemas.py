"""Contracts domain Pydantic schemas."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ContractMilestoneCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    amount: float = Field(gt=0)
    due_date: Optional[datetime] = None


class ContractMilestoneResponse(BaseModel):
    id: uuid.UUID
    contract_id: uuid.UUID
    title: str
    amount: float
    status: str
    due_date: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ContractCreate(BaseModel):
    project_id: Optional[uuid.UUID] = None
    worker_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    scope_description: str = Field(min_length=1)
    rate_type: str = Field(default="FIXED", pattern="^(FIXED|HOURLY|MONTHLY)$")
    rate_amount: float = Field(gt=0)
    currency: str = Field(default="USD", max_length=3)
    terms: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    milestones: list[ContractMilestoneCreate] = Field(default_factory=list)


class ContractUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    scope_description: Optional[str] = None
    rate_type: Optional[str] = Field(default=None, pattern="^(FIXED|HOURLY|MONTHLY)$")
    rate_amount: Optional[float] = Field(default=None, gt=0)
    terms: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class UserPartySummary(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    role: str

    model_config = {"from_attributes": True}


class ContractResponse(BaseModel):
    id: uuid.UUID
    project_id: Optional[uuid.UUID] = None
    client_id: uuid.UUID
    worker_id: uuid.UUID
    client: Optional[UserPartySummary] = None
    worker: Optional[UserPartySummary] = None
    title: str
    scope_description: str
    rate_type: str
    rate_amount: float
    currency: str
    status: str
    terms: Optional[str] = None
    client_signed_at: Optional[datetime] = None
    worker_signed_at: Optional[datetime] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    milestones: list[ContractMilestoneResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}
