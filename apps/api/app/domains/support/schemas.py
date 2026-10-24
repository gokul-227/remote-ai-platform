"""Support request/response schemas."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Category = Literal["ACCOUNT", "BUG", "CONTRACT", "SAFETY", "OTHER"]
Severity = Literal["LOW", "NORMAL", "HIGH", "URGENT"]
Status = Literal["OPEN", "IN_PROGRESS", "WAITING_ON_USER", "RESOLVED", "CLOSED"]


class TicketCreate(BaseModel):
    subject: str = Field(min_length=3, max_length=255)
    category: Category
    body: str = Field(min_length=1, max_length=10_000)


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10_000)


class StaffMessageCreate(MessageCreate):
    internal: bool = False


class StaffTicketUpdate(BaseModel):
    expected_version: int
    reason: str = Field(min_length=3, max_length=500)
    status: Status | None = None
    severity: Severity | None = None
    assignee_id: uuid.UUID | None = None
    unassign: bool = False


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    author_id: uuid.UUID | None
    body: str
    internal: bool
    from_staff: bool = False
    created_at: datetime


class TicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    requester_id: uuid.UUID
    subject: str
    category: str
    severity: str
    status: str
    sla_due_at: datetime
    first_response_at: datetime | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime


class StaffTicketOut(TicketOut):
    assignee_id: uuid.UUID | None
    version: int
    overdue: bool = False
    requester_email: str | None = None


class TicketDetail(BaseModel):
    ticket: TicketOut
    messages: list[MessageOut]


class StaffTicketDetail(BaseModel):
    ticket: StaffTicketOut
    messages: list[MessageOut]
