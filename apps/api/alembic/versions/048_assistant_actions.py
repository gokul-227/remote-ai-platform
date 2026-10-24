"""Assistant actions awaiting (or past) user confirmation.

Revision ID: 048_assistant_actions
Revises: 047_work_items

Additive: one new table with RLS enabled and no policies (see 042).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision = "048_assistant_actions"
down_revision = "047_work_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_actions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tool", sa.String(60), nullable=False),
        sa.Column("args", JSONB(), nullable=False),
        sa.Column("summary", sa.String(500), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("result", JSONB(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_assistant_actions_user_id", "assistant_actions", ["user_id"])
    op.create_index("ix_assistant_actions_status", "assistant_actions", ["status"])
    op.execute("ALTER TABLE assistant_actions ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("assistant_actions")
