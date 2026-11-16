"""Paid features: catalogue columns on plans, entitlements, purchases, invoices,
sponsored campaigns and credit tables; seed the EUR catalogue.

Revision ID: 078_billing_catalog
Revises: 076_merge_scale_and_boards

Non-destructive: only adds tables and nullable/defaulted columns, and inserts
catalogue rows that do not exist yet (ON CONFLICT (slug) DO NOTHING), so
prices staff have edited are never overwritten. No CONCURRENTLY: every new
index is on a new or small table.
"""

import json
import uuid

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "078_billing_catalog"
down_revision = "077_board_discovery"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _id() -> sa.Column:
    return sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _ts(name: str, nullable: bool = False) -> sa.Column:
    if nullable:
        return sa.Column(name, sa.DateTime(timezone=True), nullable=True)
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False)


def _user(name: str = "user_id", ondelete: str = "CASCADE", nullable: bool = False) -> sa.Column:
    return sa.Column(name, UUID, sa.ForeignKey("users.id", ondelete=ondelete), nullable=nullable)


_RLS_TABLES = (
    "billing_customers",
    "billing_purchases",
    "billing_invoices",
    "entitlements",
    "sponsored_campaigns",
    "ad_clicks",
    "message_credit_spends",
    "credit_usage",
    "billing_referrals",
    "billing_referral_codes",
)


def upgrade() -> None:
    for col in (
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("audience", sa.String(20), nullable=False, server_default="member"),
        sa.Column("mode", sa.String(20), nullable=False, server_default="free"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="eur"),
        sa.Column("duration_days", sa.Integer, nullable=True),
        sa.Column("target", sa.String(20), nullable=True),
        sa.Column("trial_days", sa.Integer, nullable=True),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("stripe_product_id", sa.String(255), nullable=True),
        sa.Column("stripe_price_id", sa.String(255), nullable=True),
    ):
        op.add_column("plans", col)
    op.add_column(
        "subscriptions",
        sa.Column("cancel_at_period_end", sa.Boolean, nullable=False, server_default="false"),
    )

    op.create_table(
        "billing_customers",
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("stripe_customer_id", sa.String(255), nullable=False, unique=True),
        _ts("trial_used_at", nullable=True),
        _ts("created_at"),
    )
    op.create_table(
        "billing_purchases",
        _id(),
        _user(ondelete="SET NULL", nullable=True),
        sa.Column("plan_id", UUID, sa.ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("plan_slug", sa.String(100), nullable=False),
        sa.Column("mode", sa.String(20), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("amount_total", sa.Integer, nullable=True),
        sa.Column("amount_refunded", sa.Integer, nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="eur"),
        sa.Column("subject_type", sa.String(20), nullable=True),
        sa.Column("subject_id", sa.String(64), nullable=True),
        sa.Column("fulfilment_status", sa.String(20), nullable=False, server_default="none"),
        sa.Column("stripe_checkout_session_id", sa.String(255), nullable=True, unique=True),
        sa.Column("stripe_payment_intent_id", sa.String(255), nullable=True),
        sa.Column("stripe_subscription_id", sa.String(255), nullable=True),
        _ts("created_at"),
        _ts("paid_at", nullable=True),
        _ts("refunded_at", nullable=True),
    )
    op.create_index("ix_billing_purchases_user_id", "billing_purchases", ["user_id"])
    op.create_index("ix_billing_purchases_status", "billing_purchases", ["status"])
    op.create_index("ix_billing_purchases_stripe_payment_intent_id", "billing_purchases", ["stripe_payment_intent_id"])

    op.create_table(
        "billing_invoices",
        _id(),
        _user(ondelete="SET NULL", nullable=True),
        sa.Column("stripe_invoice_id", sa.String(255), nullable=False, unique=True),
        sa.Column("stripe_subscription_id", sa.String(255), nullable=True),
        sa.Column("amount_paid", sa.Integer, nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="eur"),
        sa.Column("status", sa.String(30), nullable=False, server_default="paid"),
        sa.Column("hosted_invoice_url", sa.Text, nullable=True),
        sa.Column("invoice_pdf", sa.Text, nullable=True),
        _ts("period_start", nullable=True),
        _ts("period_end", nullable=True),
        _ts("created_at"),
    )
    op.create_index("ix_billing_invoices_user_id", "billing_invoices", ["user_id"])

    op.create_table(
        "entitlements",
        _id(),
        _user(),
        sa.Column("key", sa.String(64), nullable=False),
        sa.Column("quantity", sa.Integer, nullable=False, server_default="1"),
        sa.Column("subject_type", sa.String(20), nullable=True),
        sa.Column("subject_id", sa.String(64), nullable=True),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("source_ref", sa.String(255), nullable=False),
        _ts("starts_at"),
        _ts("expires_at", nullable=True),
        _ts("revoked_at", nullable=True),
        _ts("created_at"),
        _ts("updated_at"),
        sa.UniqueConstraint("source_ref", "key", name="uq_entitlements_source_key"),
    )
    op.create_index("ix_entitlements_user_id", "entitlements", ["user_id"])
    op.create_index("ix_entitlements_key", "entitlements", ["key"])
    op.create_index("ix_entitlements_subject_id", "entitlements", ["subject_id"])

    op.create_table(
        "sponsored_campaigns",
        _id(),
        _user(),
        sa.Column("job_id", UUID, sa.ForeignKey("job_posts.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("daily_budget_cents", sa.Integer, nullable=False),
        sa.Column("max_cpc_cents", sa.Integer, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("spent_cents", sa.Integer, nullable=False, server_default="0"),
        _ts("created_at"),
        _ts("updated_at"),
    )
    op.create_index("ix_sponsored_campaigns_user_id", "sponsored_campaigns", ["user_id"])
    op.create_index("ix_sponsored_campaigns_status", "sponsored_campaigns", ["status"])
    op.create_table(
        "ad_clicks",
        _id(),
        sa.Column(
            "campaign_id", UUID, sa.ForeignKey("sponsored_campaigns.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("day", sa.String(10), nullable=False),
        sa.Column("cost_cents", sa.Integer, nullable=False),
        _ts("created_at"),
        sa.UniqueConstraint("campaign_id", "fingerprint", "day", name="uq_ad_clicks_dedup"),
    )
    op.create_table(
        "message_credit_spends",
        _id(),
        _user(),
        _user("recipient_id"),
        sa.Column("entitlement_id", UUID, nullable=True),
        _ts("spent_at"),
        _ts("replied_at", nullable=True),
        _ts("refunded_at", nullable=True),
    )
    op.create_index("ix_message_credit_spends_user_id", "message_credit_spends", ["user_id"])
    op.create_table(
        "credit_usage",
        _id(),
        _user(),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("month", sa.String(7), nullable=False),
        sa.Column("used", sa.Integer, nullable=False, server_default="0"),
        sa.UniqueConstraint("user_id", "kind", "month", name="uq_credit_usage_month"),
    )
    op.create_index("ix_credit_usage_user_id", "credit_usage", ["user_id"])
    op.create_table(
        "billing_referrals",
        _id(),
        _user("referrer_id"),
        sa.Column("referred_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        _ts("rewarded_at", nullable=True),
        _ts("created_at"),
    )
    op.create_index("ix_billing_referrals_referrer_id", "billing_referrals", ["referrer_id"])
    op.create_table(
        "billing_referral_codes",
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("code", sa.String(16), nullable=False, unique=True),
    )

    # Seed the catalogue from app/domains/billing/catalog.py. Existing slugs are
    # left alone, so re-running never overwrites prices staff have edited.
    from app.domains.billing.catalog import CATALOG

    stmt = sa.text(
        "INSERT INTO plans (id, name, slug, price_cents, billing_interval, entitlements, is_active, "
        "description, audience, mode, currency, duration_days, target, trial_days, sort_order) "
        "VALUES (:id, :name, :slug, :price_cents, :billing_interval, CAST(:entitlements AS JSONB), "
        ":is_active, :description, :audience, :mode, 'eur', :duration_days, :target, :trial_days, "
        ":sort_order) ON CONFLICT (slug) DO NOTHING"
    )
    for item in CATALOG:
        op.execute(
            stmt.bindparams(
                id=uuid.uuid5(uuid.NAMESPACE_URL, f"rap-plan:{item['slug']}"),
                name=item["name"],
                slug=item["slug"],
                price_cents=item["price_cents"],
                billing_interval=item["billing_interval"],
                entitlements=json.dumps(item["grants"]),
                is_active=item.get("enabled", True),
                description=item["description"],
                audience=item["audience"],
                mode=item["mode"],
                duration_days=item["duration_days"],
                target=item["target"],
                trial_days=item.get("trial_days"),
                sort_order=item["sort_order"],
            )
        )

    # DATA-03: every public table has row level security (no policies: only the
    # API's own role, which bypasses RLS as owner, reads these tables).
    if op.get_bind().dialect.name == "postgresql":
        for table in _RLS_TABLES:
            op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in (
        "billing_referral_codes",
        "billing_referrals",
        "credit_usage",
        "message_credit_spends",
        "ad_clicks",
        "sponsored_campaigns",
        "entitlements",
        "billing_invoices",
        "billing_purchases",
        "billing_customers",
    ):
        op.drop_table(table)
    op.drop_column("subscriptions", "cancel_at_period_end")
    for col in (
        "stripe_price_id", "stripe_product_id", "sort_order", "trial_days", "target",
        "duration_days", "currency", "mode", "audience", "description",
    ):
        op.drop_column("plans", col)
    op.execute("DELETE FROM plans WHERE slug <> 'free'")
