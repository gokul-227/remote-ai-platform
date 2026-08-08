"""Add sandbox payment transaction records."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "014_payment_abstraction"
down_revision: Union[str, None] = "013_work_ledger"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payment_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("project_tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("payer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(3), server_default="USD", nullable=False),
        sa.Column("status", sa.String(20), server_default="ESCROWED", nullable=False),
        sa.Column("provider", sa.String(30), server_default="SANDBOX", nullable=False),
        sa.Column("provider_reference", sa.String(100), unique=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("amount > 0", name="ck_payment_positive_amount"),
    )
    for name, column in (("ix_payment_transactions_project_id", "project_id"), ("ix_payment_transactions_task_id", "task_id"), ("ix_payment_transactions_status", "status")):
        op.create_index(name, "payment_transactions", [column])


def downgrade() -> None:
    for name in ("ix_payment_transactions_status", "ix_payment_transactions_task_id", "ix_payment_transactions_project_id"):
        op.drop_index(name, table_name="payment_transactions")
    op.drop_table("payment_transactions")
