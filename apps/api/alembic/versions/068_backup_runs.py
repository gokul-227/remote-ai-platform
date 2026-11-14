"""Backup and restore run evidence reported by ops/backup scripts.

Additive: a new table, no changes to existing data. Also repairs databases that
ran an early draft of 063 and lack messages.attachment_ids (IF NOT EXISTS, so a
no-op everywhere else; the downgrade leaves it, 063 owns that column).

Revision ID: 068_backup_runs
Revises: 067_staff_roles_and_flags
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision = "068_backup_runs"
down_revision = "067_staff_roles_and_flags"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("messages", "channel_messages"):
        op.execute(
            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS attachment_ids JSONB NOT NULL DEFAULT '[]'::jsonb"
        )
    op.create_table(
        "backup_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("environment", sa.String(20), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("archive_name", sa.String(200), nullable=True),
        sa.Column("sha256", sa.String(64), nullable=True),
        sa.Column("size_bytes", sa.BigInteger, nullable=True),
        sa.Column("tables", sa.Integer, nullable=True),
        sa.Column("objects", sa.Integer, nullable=True),
        sa.Column("target_label", sa.String(120), nullable=True),
        sa.Column("detail", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_backup_runs_kind_env_finished", "backup_runs", ["kind", "environment", "finished_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_backup_runs_kind_env_finished", table_name="backup_runs")
    op.drop_table("backup_runs")
