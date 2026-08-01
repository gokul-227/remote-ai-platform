"""Add project workspace and delivery management fields."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "009_project_management"
down_revision: Union[str, None] = "008_network_layer"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _id(name: str):
    return sa.Column(name, postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()"))


def upgrade() -> None:
    op.add_column("projects", sa.Column("timeline", sa.String(100), nullable=True))
    op.add_column("projects", sa.Column("budget", sa.Float(), nullable=True))
    op.alter_column("projects", "status", server_default="CREATED")
    op.add_column("project_tasks", sa.Column("assigned_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.add_column("project_tasks", sa.Column("priority", sa.String(20), server_default="MEDIUM", nullable=False))
    op.add_column("project_tasks", sa.Column("deadline", sa.DateTime(timezone=True), nullable=True))
    op.add_column("project_tasks", sa.Column("estimated_hours", sa.Float(), nullable=True))
    op.add_column("project_tasks", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_project_tasks_assigned_user_id", "project_tasks", ["assigned_user_id"])
    op.add_column("ai_reports", sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True))
    op.add_column("ai_reports", sa.Column("content", sa.Text(), nullable=True))
    op.create_index("ix_ai_reports_project_id", "ai_reports", ["project_id"])

    op.create_table(
        "project_members",
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role", sa.String(30), server_default="MEMBER", nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "milestones",
        _id("id"),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(30), server_default="TODO", nullable=False),
    )
    op.create_index("ix_milestones_project_id", "milestones", ["project_id"])
    op.create_table(
        "task_comments",
        _id("id"),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("project_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_task_comments_task_id", "task_comments", ["task_id"])
    op.create_table(
        "project_activity",
        _id("id"),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("payload", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_project_activity_project_id", "project_activity", ["project_id"])


def downgrade() -> None:
    op.drop_table("project_activity")
    op.drop_table("task_comments")
    op.drop_table("milestones")
    op.drop_table("project_members")
    op.drop_index("ix_ai_reports_project_id", table_name="ai_reports")
    op.drop_column("ai_reports", "content")
    op.drop_column("ai_reports", "project_id")
    op.drop_index("ix_project_tasks_assigned_user_id", table_name="project_tasks")
    for column in ("completed_at", "estimated_hours", "deadline", "priority", "assigned_user_id"):
        op.drop_column("project_tasks", column)
    op.drop_column("projects", "budget")
    op.drop_column("projects", "timeline")
