"""
Analytics Domain Models — First-Party Activation Funnel Events.

Minimal, privacy-conscious event tracking: an event name (from a fixed
vocabulary — see `app.domains.analytics.schemas.EVENT_NAMES`), an optional
user id (null for unauthenticated visitors), a small JSON properties blob,
and a timestamp. Deliberately does NOT capture IP addresses, user agents,
device fingerprints, or any tracking-cookie identifier — see
`app/domains/admin/models.py`'s `AuditEvent` for that heavier, security-focused
audit trail, which this table is not a substitute for and does not duplicate.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    event_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # Nullable: unauthenticated visitors generate funnel events (e.g. landing
    # page CTA clicks, anonymous searches) before an account exists. Never
    # derived from client input — always set server-side from the auth token.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        index=True,
    )
    properties: Mapped[dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    def __repr__(self) -> str:
        return f"<AnalyticsEvent id={self.id} event_name={self.event_name} user_id={self.user_id}>"
