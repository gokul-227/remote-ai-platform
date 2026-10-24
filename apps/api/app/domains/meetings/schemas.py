"""Meetings request/response schemas."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domains.deliverables.validation import validate_demo_url

MAX_DURATION = timedelta(hours=8)
MAX_PARTICIPANTS = 25


class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    agenda: str | None = Field(default=None, max_length=10_000)
    starts_at: datetime
    ends_at: datetime
    participant_ids: list[uuid.UUID] = Field(min_length=1, max_length=MAX_PARTICIPANTS)
    contract_id: uuid.UUID | None = None
    # Omit to get a generated Jitsi Meet room.
    external_url: str | None = None

    @field_validator("starts_at", "ends_at")
    @classmethod
    def _aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("include a timezone offset (times are stored in UTC)")
        return v.astimezone(UTC)

    @field_validator("external_url")
    @classmethod
    def _https(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        url = validate_demo_url(v)
        if not url.lower().startswith("https://"):
            raise ValueError("meeting links must use https://")
        return url

    @model_validator(mode="after")
    def _window(self) -> "MeetingCreate":
        if self.ends_at <= self.starts_at:
            raise ValueError("the meeting must end after it starts")
        if self.ends_at - self.starts_at > MAX_DURATION:
            raise ValueError("meetings can last at most 8 hours")
        if self.ends_at < datetime.now(UTC):
            raise ValueError("the meeting is already over")
        self.participant_ids = list(dict.fromkeys(self.participant_ids))
        return self


class MeetingRespond(BaseModel):
    response: Literal["ACCEPTED", "DECLINED"]


class ParticipantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    full_name: str | None = None
    response: str


class MeetingResponse(BaseModel):
    id: uuid.UUID
    organizer_id: uuid.UUID
    contract_id: uuid.UUID | None
    title: str
    agenda: str | None
    starts_at: datetime
    ends_at: datetime
    provider: str
    status: str
    participants: list[ParticipantOut]
    # Lifecycle hint for the UI: UPCOMING, JOINABLE, ENDED, CANCELLED
    phase: str
    created_at: datetime


class JoinLink(BaseModel):
    url: str
    provider: str
