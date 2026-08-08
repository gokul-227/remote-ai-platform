"""Add AI usage and execution audit logs."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "017_ai_usage_logs"
down_revision: Union[str, None] = "016_moderation_reports"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_usage_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("prompt_key", sa.String(100), nullable=True),
        sa.Column("prompt_version", sa.String(30), nullable=True),
        sa.Column("provider_model", sa.String(150), nullable=True),
        sa.Column("status", sa.String(20), server_default="SUCCESS", nullable=False),
        sa.Column("latency_ms", sa.Integer(), server_default="0", nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("completion_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("total_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ai_usage_logs_prompt_key", "ai_usage_logs", ["prompt_key"])
    op.create_index("ix_ai_usage_logs_status", "ai_usage_logs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_ai_usage_logs_status", table_name="ai_usage_logs")
    op.drop_index("ix_ai_usage_logs_prompt_key", table_name="ai_usage_logs")
    op.drop_table("ai_usage_logs")
