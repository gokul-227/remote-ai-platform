"""
Billing domain SQLAlchemy models -- Plan, Subscription.

NOTE (architecture-only pass): no real plan names, prices, or entitlement
limits have been decided by the product owner yet. `Plan.price_cents`
defaults to 0 and the seeded "free" plan's `entitlements` values are
explicitly placeholders (see the seed data migration) -- both need a real
product decision before this becomes a real monetization feature. This file
only establishes the shape of the data so that decision is easy to wire in
later; it does not itself set any prices or limits.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Subscription.status values. "trialing" and "past_due" mirror Stripe's own
# subscription status vocabulary so a later real Stripe integration maps
# onto this column without a translation layer.
SUBSCRIPTION_STATUSES = ("active", "trialing", "past_due", "canceled", "incomplete")


class Plan(Base):
    """
    A billing plan. One row (slug="free") is seeded by migration so
    entitlement checks always have a fallback plan to resolve to, even
    before any real paid plan exists.
    """

    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    # Placeholder -- no real prices have been set. 0 means "not priced yet",
    # not "free forever"; a future paid plan will overwrite this per-row.
    price_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # "month" | "year". Not enforced via DB enum since the exact set of
    # supported intervals is itself a pricing decision still to be made.
    billing_interval: Mapped[str] = mapped_column(String(20), default="month", nullable=False)
    # Generic, extensible feature-flag/limit bag, e.g.
    # {"max_job_postings": 5, "ai_matching": true}. Deliberately untyped here:
    # which keys exist and what they mean is a product decision, not an
    # architectural one. See entitlements.py for how these are read.
    entitlements: Mapped[dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Subscription(Base):
    """
    Links a user (engineer or company account -- CompanyProfile is reachable
    via its own `user_id`, so this points at the User rather than duplicating
    a company FK) to a Plan. `stripe_customer_id`/`stripe_subscription_id`
    are stubbed for a later real Stripe Billing/webhook integration -- this
    pass does not create or update them from any live Stripe call.
    """

    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # active, trialing, past_due, canceled, incomplete -- see SUBSCRIPTION_STATUSES.
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False, index=True)
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Stubbed for later real Stripe Billing wiring -- not populated by any
    # live checkout/webhook flow yet.
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
