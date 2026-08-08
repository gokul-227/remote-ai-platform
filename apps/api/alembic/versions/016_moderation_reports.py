"""Add moderation reports and decision state."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "016_moderation_reports"
down_revision: Union[str, None] = "015_project_reputation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "moderation_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("reporter_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_type", sa.String(20), nullable=False),
        sa.Column("target_id", sa.String(255), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), server_default="OPEN", nullable=False),
        sa.Column("decision", sa.String(30), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("reviewed_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_moderation_reports_reporter_id", "moderation_reports", ["reporter_id"])
    op.create_index("ix_moderation_reports_target_id", "moderation_reports", ["target_id"])
    op.create_index("ix_moderation_reports_status", "moderation_reports", ["status"])


def downgrade() -> None:
    op.drop_index("ix_moderation_reports_status", table_name="moderation_reports")
    op.drop_index("ix_moderation_reports_target_id", table_name="moderation_reports")
    op.drop_index("ix_moderation_reports_reporter_id", table_name="moderation_reports")
    op.drop_table("moderation_reports")
