"""Attribute AI usage to users for per-user token allowances.

Revision ID: 034_ai_usage_user
Revises: 033_user_sessions_revoked_at

Adds ai_usage_logs.user_id (nullable; background work has no user) and an
index on created_at for the monthly/daily allowance sums. Additive only.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "034_ai_usage_user"
down_revision = "033_user_sessions_revoked_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ai_usage_logs",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_ai_usage_logs_user_id", "ai_usage_logs", ["user_id"])
    op.create_index("ix_ai_usage_logs_created_at", "ai_usage_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_usage_logs_created_at", table_name="ai_usage_logs")
    op.drop_index("ix_ai_usage_logs_user_id", table_name="ai_usage_logs")
    op.drop_column("ai_usage_logs", "user_id")
