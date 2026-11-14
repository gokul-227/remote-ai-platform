"""
Durable records for background processing.

Redis (the Celery broker) is a transport only. Everything an operator needs to
answer "did it run, what happened, what is stuck" lives in PostgreSQL:

- `job_sources`            per-source schedule, caps and permission state (editable by staff)
- `task_runs`              one row per task execution with its full lifecycle
- `outbox_events`          events created inside API transactions, dispatched to tasks later
- `job_import_checkpoints` where each import source got to
- `dead_letters`           tasks that exhausted their retries, retryable from the console
- `worker_heartbeats`      liveness of every worker/scheduler process

No table here references `users`: actors are recorded in `audit_events`.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

_JSON = JSON().with_variant(JSONB, "postgresql")

TASK_QUEUED = "QUEUED"
TASK_STARTED = "STARTED"
TASK_SUCCEEDED = "SUCCEEDED"
TASK_RETRYING = "RETRYING"
TASK_FAILED = "FAILED"
TASK_DEAD = "DEAD"
TASK_TERMINAL = {TASK_SUCCEEDED, TASK_FAILED, TASK_DEAD}


class JobSource(Base):
    __tablename__ = "job_sources"

    name: Mapped[str] = mapped_column(String(50), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    cron: Mapped[str] = mapped_column(String(64), nullable=False, default="17 */3 * * *")
    max_per_run: Mapped[int] = mapped_column(Integer, nullable=False, default=10000)
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    # Source-specific redistribution permission. Imports never run while False.
    permission_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_enqueued_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class TaskRun(Base):
    __tablename__ = "task_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    # Same key + non-terminal run => the enqueue is a no-op (idempotency).
    idempotency_key: Mapped[str] = mapped_column(String(160), nullable=False, unique=True)
    args: Mapped[dict[str, Any]] = mapped_column(_JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=TASK_QUEUED, index=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    worker_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    result: Mapped[dict[str, Any] | None] = mapped_column(_JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class OutboxEvent(Base):
    __tablename__ = "outbox_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    aggregate_type: Mapped[str] = mapped_column(String(50), nullable=False)
    aggregate_id: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(_JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    dispatched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)


class JobImportCheckpoint(Base):
    __tablename__ = "job_import_checkpoints"

    source: Mapped[str] = mapped_column(String(50), primary_key=True)
    cursor: Mapped[dict[str, Any]] = mapped_column(_JSON, nullable=False, default=dict)
    last_run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    consecutive_failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class DeadLetter(Base):
    __tablename__ = "dead_letters"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("task_runs.id", ondelete="CASCADE"), nullable=False
    )
    task_name: Mapped[str] = mapped_column(String(100), nullable=False)
    args: Mapped[dict[str, Any]] = mapped_column(_JSON, nullable=False, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    retried_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retried_run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)


class WorkerHeartbeat(Base):
    __tablename__ = "worker_heartbeats"

    worker_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # worker | scheduler
    hostname: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    queues: Mapped[list[str]] = mapped_column(_JSON, nullable=False, default=list)
    active_runs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
