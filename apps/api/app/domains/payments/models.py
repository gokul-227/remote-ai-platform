"""SQLAlchemy models for the payments domain.

Only table so far: a dedup ledger for processed Stripe webhook events. The
webhook receiver (see router.py) inserts one row per event_id *before*
applying any status change; event_id is the primary key, so a second
delivery of the same event -- Stripe's own automatic retries, or a
captured-and-replayed request (still validly signed within Stripe's
signature timestamp tolerance) -- raises IntegrityError and is treated as
an already-processed no-op instead of being applied twice.
"""

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class StripeWebhookEvent(Base):
    """One row per processed Stripe event ID -- primary key enforces dedup."""

    __tablename__ = "stripe_webhook_events"

    event_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
