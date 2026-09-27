"""Add user_blocks: blocking another member.

Revision ID: 040_user_blocks
Revises: 039_job_last_seen

A connection status of BLOCKED existed but nothing enforced it, it did not
record who blocked, and the blocked person could delete it. Blocks are now
their own rows owned by the blocker. New table only.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "040_user_blocks"
down_revision = "039_job_last_seen"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_blocks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("blocker_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("blocked_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("blocker_id", "blocked_id", name="uq_user_block_pair"),
    )
    op.create_index("ix_user_blocks_blocker_id", "user_blocks", ["blocker_id"])
    op.create_index("ix_user_blocks_blocked_id", "user_blocks", ["blocked_id"])


def downgrade() -> None:
    op.drop_table("user_blocks")
