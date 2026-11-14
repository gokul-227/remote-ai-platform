"""Durable background processing: job sources, task runs, outbox, checkpoints, dead letters, heartbeats.

Additive only. No existing table changes.

Revision ID: 056_background_tasks
Revises: 055_announcements
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision = "056_background_tasks"
down_revision = "055_announcements"
branch_labels = None
depends_on = None


def _json() -> sa.types.TypeEngine:
    return sa.JSON().with_variant(JSONB, "postgresql")


def _ts(name: str, **kw: object) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), **kw)


def upgrade() -> None:
    op.create_table(
        "job_sources",
        sa.Column("name", sa.String(50), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("cron", sa.String(64), nullable=False, server_default="17 */3 * * *"),
        sa.Column("max_per_run", sa.Integer(), nullable=False, server_default="10000"),
        sa.Column("rate_limit_per_minute", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("permission_confirmed", sa.Boolean(), nullable=False, server_default=sa.true()),
        _ts("last_enqueued_at", nullable=True),
        _ts("updated_at", nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "task_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("task_name", sa.String(100), nullable=False),
        sa.Column("idempotency_key", sa.String(160), nullable=False),
        sa.Column("args", _json(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="QUEUED"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="5"),
        _ts("scheduled_for", nullable=True),
        _ts("started_at", nullable=True),
        _ts("finished_at", nullable=True),
        _ts("next_retry_at", nullable=True),
        sa.Column("worker_id", sa.String(120), nullable=True),
        sa.Column("error", sa.String(500), nullable=True),
        sa.Column("result", _json(), nullable=True),
        _ts("created_at", nullable=False, server_default=sa.func.now()),
        _ts("updated_at", nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("idempotency_key", name="uq_task_runs_idempotency_key"),
    )
    op.create_index("ix_task_runs_task_name", "task_runs", ["task_name"])
    op.create_index("ix_task_runs_status", "task_runs", ["status"])
    op.create_index("ix_task_runs_created_at", "task_runs", ["created_at"])
    op.create_table(
        "outbox_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("aggregate_type", sa.String(50), nullable=False),
        sa.Column("aggregate_id", sa.String(64), nullable=False),
        sa.Column("payload", _json(), nullable=False),
        _ts("created_at", nullable=False, server_default=sa.func.now()),
        _ts("dispatched_at", nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.String(500), nullable=True),
    )
    op.create_index("ix_outbox_events_event_type", "outbox_events", ["event_type"])
    op.create_index("ix_outbox_events_dispatched_at", "outbox_events", ["dispatched_at"])
    op.create_table(
        "job_import_checkpoints",
        sa.Column("source", sa.String(50), primary_key=True),
        sa.Column("cursor", _json(), nullable=False),
        sa.Column("last_run_id", UUID(as_uuid=True), nullable=True),
        _ts("last_success_at", nullable=True),
        sa.Column("last_error", sa.String(500), nullable=True),
        sa.Column("consecutive_failures", sa.Integer(), nullable=False, server_default="0"),
        _ts("updated_at", nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "dead_letters",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "task_run_id",
            UUID(as_uuid=True),
            sa.ForeignKey("task_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("task_name", sa.String(100), nullable=False),
        sa.Column("args", _json(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        _ts("created_at", nullable=False, server_default=sa.func.now()),
        _ts("retried_at", nullable=True),
        sa.Column("retried_run_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_index("ix_dead_letters_created_at", "dead_letters", ["created_at"])
    op.create_table(
        "worker_heartbeats",
        sa.Column("worker_id", sa.String(120), primary_key=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("hostname", sa.String(255), nullable=False, server_default=""),
        sa.Column("queues", _json(), nullable=False),
        sa.Column("active_runs", sa.Integer(), nullable=False, server_default="0"),
        _ts("last_seen_at", nullable=False, server_default=sa.func.now()),
    )
    for table in (
        "job_sources",
        "task_runs",
        "outbox_events",
        "job_import_checkpoints",
        "dead_letters",
        "worker_heartbeats",
    ):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("worker_heartbeats")
    op.drop_index("ix_dead_letters_created_at", table_name="dead_letters")
    op.drop_table("dead_letters")
    op.drop_table("job_import_checkpoints")
    op.drop_index("ix_outbox_events_dispatched_at", table_name="outbox_events")
    op.drop_index("ix_outbox_events_event_type", table_name="outbox_events")
    op.drop_table("outbox_events")
    op.drop_index("ix_task_runs_created_at", table_name="task_runs")
    op.drop_index("ix_task_runs_status", table_name="task_runs")
    op.drop_index("ix_task_runs_task_name", table_name="task_runs")
    op.drop_table("task_runs")
    op.drop_table("job_sources")
