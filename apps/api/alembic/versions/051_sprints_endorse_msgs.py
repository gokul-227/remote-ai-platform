"""Sprints, skill endorsements, channel message edit/delete/reactions, commit check.

Revision ID: 051_sprints_endorse_msgs
Revises: 050_reactions_invites_notify

Additive: two new tables, new nullable columns. RLS on for new tables (see 042).
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "051_sprints_endorse_msgs"
down_revision = "050_reactions_invites_notify"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_sprints",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("goal", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="PLANNED"),
        sa.Column("starts_on", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_on", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_project_sprints_project_id", "project_sprints", ["project_id"])
    op.create_index("ix_project_sprints_status", "project_sprints", ["status"])
    op.add_column(
        "project_tasks",
        sa.Column("sprint_id", UUID(as_uuid=True), sa.ForeignKey("project_sprints.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_project_tasks_sprint_id", "project_tasks", ["sprint_id"])
    op.create_table(
        "skill_endorsements",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("endorser_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("endorsee_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("skill", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("endorser_id", "endorsee_id", "skill", name="uq_skill_endorsement"),
    )
    op.create_index("ix_skill_endorsements_endorser_id", "skill_endorsements", ["endorser_id"])
    op.create_index("ix_skill_endorsements_endorsee_id", "skill_endorsements", ["endorsee_id"])
    op.add_column("channel_messages", sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("channel_messages", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "channel_message_reactions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("message_id", UUID(as_uuid=True), sa.ForeignKey("channel_messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("emoji", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("message_id", "user_id", "emoji", name="uq_channel_message_reaction"),
    )
    op.create_index("ix_channel_message_reactions_message_id", "channel_message_reactions", ["message_id"])
    op.create_index("ix_channel_message_reactions_user_id", "channel_message_reactions", ["user_id"])
    op.add_column("deliverables", sa.Column("commit_check", sa.String(20), nullable=True))
    for table in ("project_sprints", "skill_endorsements", "channel_message_reactions"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_column("deliverables", "commit_check")
    op.drop_table("channel_message_reactions")
    op.drop_column("channel_messages", "deleted_at")
    op.drop_column("channel_messages", "edited_at")
    op.drop_table("skill_endorsements")
    op.drop_index("ix_project_tasks_sprint_id", table_name="project_tasks")
    op.drop_column("project_tasks", "sprint_id")
    op.drop_table("project_sprints")
