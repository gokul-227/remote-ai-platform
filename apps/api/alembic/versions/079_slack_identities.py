"""Slack identities and one-time link codes for the /rap Slack command.

Revision ID: 079_slack_identities
Revises: 078_billing_catalog

Non-destructive: two new tables only. No CONCURRENTLY (new, empty tables).
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "079_slack_identities"
down_revision = "078_billing_catalog"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "slack_identities",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("slack_user_id", sa.String(32), nullable=False, unique=True),
        sa.Column("slack_team_id", sa.String(32), nullable=False, server_default=""),
        sa.Column("slack_username", sa.String(120), nullable=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_slack_identities_user_id", "slack_identities", ["user_id"])
    op.create_table(
        "slack_link_codes",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_slack_link_codes_user_id", "slack_link_codes", ["user_id"])
    # DATA-03: every public table has row level security (no policies; the API's
    # owner role bypasses RLS).
    if op.get_bind().dialect.name == "postgresql":
        for table in ("slack_identities", "slack_link_codes"):
            op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_index("ix_slack_link_codes_user_id", table_name="slack_link_codes")
    op.drop_table("slack_link_codes")
    op.drop_index("ix_slack_identities_user_id", table_name="slack_identities")
    op.drop_table("slack_identities")
