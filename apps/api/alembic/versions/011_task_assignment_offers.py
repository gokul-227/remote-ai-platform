"""Add worker task assignment offers."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "011_task_assignment_offers"
down_revision: Union[str, None] = "010_task_dependencies"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "task_assignment_offers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("project_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("candidate_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("offered_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), server_default="OFFERED", nullable=False),
        sa.Column("match_score", sa.Float(), server_default="0", nullable=False),
        sa.Column("matched_skills", postgresql.JSONB(), server_default="[]", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_task_assignment_offers_task_id", "task_assignment_offers", ["task_id"])
    op.create_index("ix_task_assignment_offers_candidate_user_id", "task_assignment_offers", ["candidate_user_id"])
    op.create_index("ix_task_assignment_offers_status", "task_assignment_offers", ["status"])


def downgrade() -> None:
    op.drop_index("ix_task_assignment_offers_status", table_name="task_assignment_offers")
    op.drop_index("ix_task_assignment_offers_candidate_user_id", table_name="task_assignment_offers")
    op.drop_index("ix_task_assignment_offers_task_id", table_name="task_assignment_offers")
    op.drop_table("task_assignment_offers")
