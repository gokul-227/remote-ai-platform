"""Add work submissions and review state."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "012_work_submissions"
down_revision: Union[str, None] = "011_task_assignment_offers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "work_submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("project_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("submitted_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("status", sa.String(30), server_default="SUBMITTED", nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("artifact_urls", postgresql.JSONB(), server_default="[]", nullable=False),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("quality_score", sa.Float(), nullable=True),
        sa.Column("ai_feedback", sa.Text(), nullable=True),
        sa.Column("reviewed_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_work_submissions_task_id", "work_submissions", ["task_id"])
    op.create_index("ix_work_submissions_status", "work_submissions", ["status"])


def downgrade() -> None:
    op.drop_index("ix_work_submissions_status", table_name="work_submissions")
    op.drop_index("ix_work_submissions_task_id", table_name="work_submissions")
    op.drop_table("work_submissions")
