"""In-app call signalling (WebRTC offer/answer/ICE relayed by the API).

Revision ID: 054_call_signals
Revises: 053_github_connections
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision = "054_call_signals"
down_revision = "053_github_connections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "call_signals",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("meeting_id", UUID(as_uuid=True), sa.ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("to_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("payload", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_call_signals_meeting_id", "call_signals", ["meeting_id"])
    op.create_index("ix_call_signals_to_user_id", "call_signals", ["to_user_id"])
    op.execute("ALTER TABLE call_signals ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("call_signals")
