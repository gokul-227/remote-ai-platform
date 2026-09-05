"""Add analytics_events table for first-party activation funnel tracking.

Revision ID: 029_analytics_events
Revises: 030_billing_entitlements

Minimal event log (event_name, optional user_id, small JSON properties,
created_at) backing a new POST /api/v1/analytics/events ingestion endpoint
and an admin-only funnel summary endpoint. Deliberately separate from
`activity_logs` / `audit_events` in the admin domain, which serve a
different purpose (admin-observable actions / security audit trail) and
already have other consumers pattern-matching on their `action` column.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "031_analytics_events"
down_revision = "030_billing_entitlements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analytics_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("event_name", sa.String(64), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("properties", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_analytics_events_event_name", "analytics_events", ["event_name"])
    op.create_index("ix_analytics_events_user_id", "analytics_events", ["user_id"])
    op.create_index("ix_analytics_events_created_at", "analytics_events", ["created_at"])


def downgrade() -> None:
    op.drop_table("analytics_events")
