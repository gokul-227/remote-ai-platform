"""Add plans and subscriptions tables for billing/entitlements architecture.

Revision ID: 029_billing_entitlements
Revises: 029_database_integrity_indexes

Architecture-only pass: no real pricing has been decided. This creates the
`plans` and `subscriptions` tables and seeds a single `slug="free"` Plan row
so `check_entitlement()` (app/domains/billing/entitlements.py) always has a
fallback plan to resolve to, even before any real paid plan is created. The
seeded free-tier entitlement values below are explicitly placeholders --
they need a real product decision (what should actually be limited, and by
how much) before they mean anything commercially. No existing endpoint reads
or enforces them yet.
"""

import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "030_billing_entitlements"
down_revision = "029_database_integrity_indexes"
branch_labels = None
depends_on = None

FREE_PLAN_ID = "8f14e45f-ceea-4b3a-b9a1-000000000001"


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("price_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("billing_interval", sa.String(20), nullable=False, server_default="month"),
        sa.Column("entitlements", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            onupdate=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_plans_slug", "plans", ["slug"])

    op.create_table(
        "subscriptions",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "plan_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("plans.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("status", sa.String(30), nullable=False, server_default="active"),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stripe_customer_id", sa.String(255), nullable=True),
        sa.Column("stripe_subscription_id", sa.String(255), nullable=True, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            onupdate=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"])
    op.create_index("ix_subscriptions_plan_id", "subscriptions", ["plan_id"])
    op.create_index("ix_subscriptions_status", "subscriptions", ["status"])
    op.create_index("ix_subscriptions_stripe_customer_id", "subscriptions", ["stripe_customer_id"])

    # Seed the free-tier fallback plan. Values are placeholders -- see
    # module docstring and app/domains/billing/entitlements.py.
    plans_table = sa.table(
        "plans",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("name", sa.String),
        sa.column("slug", sa.String),
        sa.column("price_cents", sa.Integer),
        sa.column("billing_interval", sa.String),
        sa.column("entitlements", postgresql.JSONB),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(
        plans_table,
        [
            {
                "id": uuid.UUID(FREE_PLAN_ID),
                "name": "Free",
                "slug": "free",
                "price_cents": 0,
                "billing_interval": "month",
                "entitlements": {
                    "max_job_postings": 3,
                    "max_saved_jobs": 25,
                    "ai_matching": True,
                },
                "is_active": True,
            }
        ],
    )


def downgrade() -> None:
    op.drop_table("subscriptions")
    op.drop_table("plans")
