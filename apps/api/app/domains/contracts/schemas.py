"""Contracts domain Pydantic schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ContractMilestoneCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    amount: float = Field(gt=0)
    due_date: datetime | None = None


class ContractMilestoneStatusUpdate(BaseModel):
    status: str = Field(pattern="^(PENDING|IN_PROGRESS|DELIVERED|APPROVED|PAID)$")


class ContractMilestoneResponse(BaseModel):
    id: uuid.UUID
    contract_id: uuid.UUID
    title: str
    amount: float
    status: str
    due_date: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ContractCreate(BaseModel):
    project_id: uuid.UUID | None = None
    worker_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    scope_description: str = Field(min_length=1)
    rate_type: str = Field(default="FIXED", pattern="^(FIXED|HOURLY|MONTHLY)$")
    rate_amount: float = Field(gt=0)
    currency: str = Field(default="USD", max_length=3)
    terms: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    milestones: list[ContractMilestoneCreate] = Field(default_factory=list)


class ContractUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    scope_description: str | None = None
    rate_type: str | None = Field(default=None, pattern="^(FIXED|HOURLY|MONTHLY)$")
    rate_amount: float | None = Field(default=None, gt=0)
    terms: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None


class UserPartySummary(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    role: str

    model_config = {"from_attributes": True}


class ContractResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID | None = None
    client_id: uuid.UUID
    worker_id: uuid.UUID
    client: UserPartySummary | None = None
    worker: UserPartySummary | None = None
    title: str
    scope_description: str
    rate_type: str
    rate_amount: float
    currency: str
    status: str
    terms: str | None = None
    client_signed_at: datetime | None = None
    worker_signed_at: datetime | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    created_at: datetime
    updated_at: datetime
    milestones: list[ContractMilestoneResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}
