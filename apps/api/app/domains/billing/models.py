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

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
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
    # Catalogue fields (migration 078_billing_catalog). "free" stays mode="free".
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    audience: Mapped[str] = mapped_column(String(20), default="member", nullable=False)
    mode: Mapped[str] = mapped_column(String(20), default="free", nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="eur", nullable=False)
    duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target: Mapped[str | None] = mapped_column(String(20), nullable=True)
    trial_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    stripe_product_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_price_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
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
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class BillingCustomer(Base):
    """The Stripe Customer created for a user at their first checkout."""

    __tablename__ = "billing_customers"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    stripe_customer_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    # A free trial is offered once per user.
    trial_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Purchase(Base):
    """One Checkout Session (one-off or the first payment of a subscription).

    Kept after account deletion with user_id cleared: payment records are
    needed for tax and accounting (see auth/retention.py).
    """

    __tablename__ = "billing_purchases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False
    )
    plan_slug: Mapped[str] = mapped_column(String(100), nullable=False)
    mode: Mapped[str] = mapped_column(String(20), nullable=False)
    # pending -> paid -> refunded | partially_refunded; expired if never paid.
    status: Mapped[str] = mapped_column(String(30), default="pending", nullable=False, index=True)
    amount_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    amount_refunded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="eur", nullable=False)
    subject_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    subject_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # none | queued | done -- social boosts are fulfilled by staff.
    fulfilment_status: Mapped[str] = mapped_column(String(20), default="none", nullable=False)
    stripe_checkout_session_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Invoice(Base):
    """A paid Stripe invoice (subscription renewals). Kept like purchases."""

    __tablename__ = "billing_invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    stripe_invoice_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    amount_paid: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="eur", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="paid", nullable=False)
    hosted_invoice_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    invoice_pdf: Mapped[str | None] = mapped_column(Text, nullable=True)
    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Entitlement(Base):
    """A capability or credit balance granted by a purchase, a subscription or staff.

    (source_ref, key) is unique, so re-applying the same webhook grants
    nothing twice. A row is in force while revoked_at is null and expires_at
    is null or in the future.
    """

    __tablename__ = "entitlements"
    __table_args__ = (UniqueConstraint("source_ref", "key", name="uq_entitlements_source_key"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # Integer value: 1 for a switch, a balance for credits, a multiplier/allowance otherwise.
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    subject_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    subject_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False)  # purchase|subscription|staff
    source_ref: Mapped[str] = mapped_column(String(255), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class SponsoredCampaign(Base):
    """Pay-per-click sponsorship of one job, paid from the prepaid ad balance."""

    __tablename__ = "sponsored_campaigns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("job_posts.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    daily_budget_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    max_cpc_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    # active | paused | exhausted
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False, index=True)
    spent_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class AdClick(Base):
    """A charged click. (campaign, visitor fingerprint, day) is unique: duplicates are free."""

    __tablename__ = "ad_clicks"
    __table_args__ = (UniqueConstraint("campaign_id", "fingerprint", "day", name="uq_ad_clicks_dedup"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sponsored_campaigns.id", ondelete="CASCADE"), nullable=False
    )
    # Keyed hash of visitor + day; no IP address is stored.
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    day: Mapped[str] = mapped_column(String(10), nullable=False)
    cost_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class MessageCreditSpend(Base):
    """One messaging credit spent on a first message; returned after 14 days without reply."""

    __tablename__ = "message_credit_spends"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    recipient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    entitlement_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    spent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CreditUsage(Base):
    """Monthly draws on metered allowances (proposals, AI pack tokens) per user."""

    __tablename__ = "credit_usage"
    __table_args__ = (UniqueConstraint("user_id", "kind", "month", name="uq_credit_usage_month"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(30), nullable=False)  # proposals | ai_pack_tokens
    month: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Referral(Base):
    """Give 10 / get 10 EUR: both get Stripe customer-balance credit on the referred user's first payment."""

    __tablename__ = "billing_referrals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referrer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    referred_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    rewarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ReferralCode(Base):
    __tablename__ = "billing_referral_codes"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
