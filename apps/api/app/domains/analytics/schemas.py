"""
Analytics Domain Schemas.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# Fixed vocabulary for the activation funnel this system tracks:
#   visitor -> signup -> email verified -> profile completed -> first search
#   -> first match viewed -> application/project started -> message sent
#
# Keeping this a closed set (rather than free-form event names) is what makes
# the admin funnel summary meaningful and keeps the ingestion endpoint from
# becoming a general-purpose, unbounded logging sink.
EVENT_NAMES: frozenset[str] = frozenset(
    {
        # Visitor stage — anonymous, pre-signup engagement signals.
        "cta_clicked",
        # Signup stage.
        "signup_completed",
        # Email verification stage.
        "email_verified",
        # Profile completion stage.
        "profile_completed",
        # First search stage.
        "search_performed",
        # First match viewed stage.
        "match_viewed",
        # Application / project started stage.
        "application_submitted",
        "project_created",
        # Message sent stage.
        "message_sent",
    }
)

# Properties are intentionally minimal — small, non-identifying context only
# (e.g. a page name, a search query length, a job id). No free-text PII, no
# fingerprinting data. Cap size defensively since this endpoint is reachable
# by unauthenticated clients.
MAX_PROPERTIES_KEYS = 20
MAX_PROPERTY_VALUE_LENGTH = 500


class AnalyticsEventCreate(BaseModel):
    event_name: str = Field(..., max_length=64)
    properties: dict[str, Any] = Field(default_factory=dict)


class AnalyticsEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_name: str
    user_id: uuid.UUID | None
    properties: dict[str, Any]
    created_at: datetime


class FunnelSummaryRow(BaseModel):
    event_name: str
    day: str
    count: int


class AnalyticsSummaryResponse(BaseModel):
    rows: list[FunnelSummaryRow]
