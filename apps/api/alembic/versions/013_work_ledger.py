"""Add non-financial work ledger entries."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "013_work_ledger"
down_revision: Union[str, None] = "012_work_submissions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "work_ledger_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("project_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("worker_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("work_submissions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), server_default="RECORDED", nullable=False),
        sa.Column("voided_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("void_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("duration_minutes > 0", name="ck_work_ledger_positive_duration"),
    )
    for name, column in (("ix_work_ledger_entries_project_id", "project_id"), ("ix_work_ledger_entries_task_id", "task_id"), ("ix_work_ledger_entries_worker_id", "worker_id"), ("ix_work_ledger_entries_status", "status")):
        op.create_index(name, "work_ledger_entries", [column])


def downgrade() -> None:
    for name in ("ix_work_ledger_entries_status", "ix_work_ledger_entries_worker_id", "ix_work_ledger_entries_task_id", "ix_work_ledger_entries_project_id"):
        op.drop_index(name, table_name="work_ledger_entries")
    op.drop_table("work_ledger_entries")
