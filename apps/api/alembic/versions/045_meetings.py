"""Meetings: scheduling, invitations, authorised join links.

Revision ID: 045_meetings
Revises: 044_deliverables

Additive: two new tables with RLS enabled and no policies (see 042).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "045_meetings"
down_revision = "044_deliverables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meetings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organizer_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("contract_id", UUID(as_uuid=True), sa.ForeignKey("contracts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("agenda", sa.Text(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("join_url", sa.String(2048), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="SCHEDULED"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    for col in ("organizer_id", "contract_id", "starts_at", "status"):
        op.create_index(f"ix_meetings_{col}", "meetings", [col])
    op.create_table(
        "meeting_participants",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("meeting_id", UUID(as_uuid=True), sa.ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("response", sa.String(20), nullable=False, server_default="INVITED"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("meeting_id", "user_id", name="uq_meeting_participant"),
    )
    op.create_index("ix_meeting_participants_meeting_id", "meeting_participants", ["meeting_id"])
    op.create_index("ix_meeting_participants_user_id", "meeting_participants", ["user_id"])
    op.execute("ALTER TABLE meetings ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("meeting_participants")
    op.drop_table("meetings")
