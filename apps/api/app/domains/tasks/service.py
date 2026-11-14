"""
Task lifecycle, outbox dispatch and import scheduling on top of PostgreSQL.

The Celery broker is only told "run task X for run Y". Every state change is
written here first, so a lost broker message or a killed worker is visible as a
QUEUED/STARTED row that never finished, and the scheduler re-enqueues it.
"""

import hashlib
import json
import socket
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from croniter import croniter
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.domains.tasks.models import (
    TASK_DEAD,
    TASK_QUEUED,
    TASK_RETRYING,
    TASK_STARTED,
    TASK_SUCCEEDED,
    TASK_TERMINAL,
    DeadLetter,
    JobImportCheckpoint,
    JobSource,
    OutboxEvent,
    TaskRun,
    WorkerHeartbeat,
)

logger = get_logger(__name__)

# Exponential-ish backoff between attempts (seconds). Attempt n waits BACKOFF[min(n-1, last)].
BACKOFF_SECONDS = (60, 300, 900, 3600)

# Celery task names.
TASK_IMPORT_SOURCE = "jobs.import_source"
TASK_MAINTAIN_CATALOGUE = "jobs.maintain_catalogue"
TASK_FLUSH_EMAIL_OUTBOX = "notifications.flush_email_outbox"
TASK_OUTBOX_EVENT = "outbox.handle_event"

# event_type -> task name. Unlisted event types go to the generic handler, which
# records them and does nothing else, so an unknown event is never lost silently.
OUTBOX_ROUTES: dict[str, str] = {
    "email.enqueued": TASK_FLUSH_EMAIL_OUTBOX,
}

# Sources whose provider asks for fewer fetches than the default schedule.
SOURCE_DEFAULT_CRON: dict[str, str] = {
    "REMOTIVE": "0 */6 * * *",
}

Dispatcher = Callable[[str, uuid.UUID, dict[str, Any], datetime | None], None]


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(ts: datetime | None) -> datetime | None:
    if ts is None:
        return None
    return ts if ts.tzinfo is not None else ts.replace(tzinfo=UTC)


def _stable_key(task_name: str, args: dict[str, Any]) -> str:
    digest = hashlib.sha256(json.dumps(args, sort_keys=True, default=str).encode()).hexdigest()
    return f"{task_name}:{digest[:40]}"


def _celery_dispatch(
    task_name: str, run_id: uuid.UUID, args: dict[str, Any], eta: datetime | None
) -> None:
    # Imported lazily so the API process never needs a broker connection at import time.
    from app.worker.celery_app import celery_app

    celery_app.send_task(
        task_name,
        kwargs={"run_id": str(run_id), **args},
        task_id=str(run_id),
        eta=eta,
        queue="imports" if task_name.startswith("jobs.") else "default",
    )


class TaskService:
    """All methods take the caller's session and commit only where documented."""

    def __init__(self, db: AsyncSession, dispatcher: Dispatcher | None = None):
        self.db = db
        self._dispatch: Dispatcher = dispatcher or _celery_dispatch

    # ── enqueue / lifecycle ──────────────────────────────────────────────────

    async def enqueue(
        self,
        task_name: str,
        args: dict[str, Any] | None = None,
        *,
        idempotency_key: str | None = None,
        max_attempts: int = 5,
        scheduled_for: datetime | None = None,
        dispatch: bool = True,
    ) -> tuple[TaskRun, bool]:
        """Create a QUEUED run and hand it to the broker. Returns (run, created).

        A non-terminal run with the same idempotency key is returned unchanged
        (created=False) and nothing is sent to the broker. Commits.
        """
        args = args or {}
        key = idempotency_key or _stable_key(task_name, args)
        existing = (
            await self.db.execute(select(TaskRun).where(TaskRun.idempotency_key == key))
        ).scalar_one_or_none()
        if existing is not None:
            if existing.status not in TASK_TERMINAL:
                return existing, False
            # Terminal run with the same key: free the key for the new run.
            existing.idempotency_key = f"{key}#{existing.id.hex[:8]}"
            await self.db.flush()
        run = TaskRun(
            task_name=task_name,
            idempotency_key=key,
            args=args,
            status=TASK_QUEUED,
            max_attempts=max_attempts,
            scheduled_for=scheduled_for,
        )
        self.db.add(run)
        await self.db.commit()
        await self.db.refresh(run)
        if dispatch and not settings.TASKS_DISPATCH_DISABLED:
            try:
                self._dispatch(task_name, run.id, args, scheduled_for)
            except Exception as exc:  # broker down: the row stays QUEUED and the scheduler retries
                logger.warning(
                    "Task dispatch failed; run stays queued",
                    task=task_name,
                    error=type(exc).__name__,
                )
        return run, True

    async def mark_started(self, run_id: uuid.UUID, worker_id: str) -> TaskRun | None:
        run = await self.db.get(TaskRun, run_id)
        if run is None:
            return None
        run.status = TASK_STARTED
        run.attempts += 1
        run.started_at = _now()
        run.worker_id = worker_id
        run.error = None
        await self.db.commit()
        return run

    async def mark_succeeded(self, run_id: uuid.UUID, result: dict[str, Any] | None = None) -> None:
        await self.db.execute(
            update(TaskRun)
            .where(TaskRun.id == run_id)
            .values(status=TASK_SUCCEEDED, finished_at=_now(), result=result, next_retry_at=None)
        )
        await self.db.commit()

    async def mark_failed(self, run_id: uuid.UUID, error: str) -> tuple[str, datetime | None]:
        """Record a failure. Returns (new status, next_retry_at). Commits.

        RETRYING until `max_attempts` is reached, then DEAD plus a dead letter.
        """
        run = await self.db.get(TaskRun, run_id)
        if run is None:
            return TASK_DEAD, None
        run.error = error[:500]
        if run.attempts >= run.max_attempts:
            run.status = TASK_DEAD
            run.finished_at = _now()
            run.next_retry_at = None
            self.db.add(
                DeadLetter(
                    task_run_id=run.id, task_name=run.task_name, args=run.args, error=error[:4000]
                )
            )
            await self.db.commit()
            return TASK_DEAD, None
        delay = BACKOFF_SECONDS[min(run.attempts - 1, len(BACKOFF_SECONDS) - 1)]
        run.status = TASK_RETRYING
        run.next_retry_at = _now() + timedelta(seconds=delay)
        await self.db.commit()
        return TASK_RETRYING, run.next_retry_at

    async def redispatch_retry(self, run: TaskRun) -> None:
        if settings.TASKS_DISPATCH_DISABLED:
            return
        try:
            self._dispatch(run.task_name, run.id, run.args, _aware(run.next_retry_at))
        except Exception as exc:
            logger.warning("Retry dispatch failed", run_id=str(run.id), error=type(exc).__name__)

    async def retry_dead_letter(self, dead_id: uuid.UUID) -> TaskRun | None:
        dead = await self.db.get(DeadLetter, dead_id)
        if dead is None or dead.retried_at is not None:
            return None
        run, _ = await self.enqueue(
            dead.task_name,
            dict(dead.args),
            idempotency_key=f"retry:{dead.id}",
            max_attempts=3,
        )
        dead.retried_at = _now()
        dead.retried_run_id = run.id
        await self.db.commit()
        return run

    async def requeue_stale(self, older_than: timedelta = timedelta(minutes=30)) -> int:
        """Runs that were QUEUED/STARTED/RETRYING longer than `older_than` without a
        terminal state are sent to the broker again (same run id). Returns the count."""
        cutoff = _now() - older_than
        rows = (
            await self.db.execute(
                select(TaskRun).where(
                    TaskRun.status.in_([TASK_QUEUED, TASK_STARTED, TASK_RETRYING]),
                    TaskRun.updated_at < cutoff,
                )
            )
        ).scalars()
        count = 0
        for run in rows:
            retry_at = _aware(run.next_retry_at)
            if run.status == TASK_RETRYING and retry_at is not None and retry_at > _now():
                continue
            if run.status == TASK_STARTED:
                # The worker died mid-run; count the lost attempt.
                status, _ = await self.mark_failed(run.id, "worker lost")
                if status == TASK_DEAD:
                    continue
            run.status = TASK_QUEUED
            run.updated_at = _now()
            await self.db.commit()
            await self.redispatch_retry(run)
            count += 1
        return count

    async def prune(self, retention: timedelta) -> int:
        cutoff = _now() - retention
        result = await self.db.execute(
            select(func.count())
            .select_from(TaskRun)
            .where(TaskRun.status.in_(list(TASK_TERMINAL)), TaskRun.created_at < cutoff)
        )
        count = int(result.scalar_one())
        if count:
            from sqlalchemy import delete

            await self.db.execute(
                delete(TaskRun).where(
                    TaskRun.status.in_(list(TASK_TERMINAL)), TaskRun.created_at < cutoff
                )
            )
            await self.db.commit()
        return count

    # ── outbox ──────────────────────────────────────────────────────────────

    async def emit(
        self,
        event_type: str,
        aggregate_type: str,
        aggregate_id: str,
        payload: dict[str, Any] | None = None,
    ) -> OutboxEvent:
        """Add an event inside the caller's transaction. Does not commit."""
        event = OutboxEvent(
            event_type=event_type,
            aggregate_type=aggregate_type,
            aggregate_id=str(aggregate_id)[:64],
            payload=payload or {},
        )
        self.db.add(event)
        await self.db.flush()
        return event

    async def dispatch_outbox(self, limit: int = 100) -> int:
        """Turn undispatched events into task runs. Returns the count. Commits."""
        stmt = (
            select(OutboxEvent)
            .where(OutboxEvent.dispatched_at.is_(None))
            .order_by(OutboxEvent.created_at)
            .limit(limit)
        )
        if self.db.bind is not None and self.db.bind.dialect.name == "postgresql":
            stmt = stmt.with_for_update(skip_locked=True)
        events = list((await self.db.execute(stmt)).scalars().all())
        dispatched = 0
        for event in events:
            task_name = OUTBOX_ROUTES.get(event.event_type, TASK_OUTBOX_EVENT)
            try:
                await self.enqueue(
                    task_name,
                    {
                        "event_id": str(event.id),
                        "event_type": event.event_type,
                        "aggregate_type": event.aggregate_type,
                        "aggregate_id": event.aggregate_id,
                        "payload": event.payload,
                    },
                    idempotency_key=f"outbox:{event.id}",
                )
                event.dispatched_at = _now()
                dispatched += 1
            except Exception as exc:
                event.attempts += 1
                event.last_error = type(exc).__name__
            await self.db.commit()
        return dispatched

    # ── import scheduling ────────────────────────────────────────────────────

    async def ensure_sources(self, names: list[str]) -> None:
        existing = set((await self.db.execute(select(JobSource.name))).scalars().all())
        added = False
        for name in names:
            if name in existing:
                continue
            self.db.add(
                JobSource(
                    name=name,
                    cron=SOURCE_DEFAULT_CRON.get(name, settings.JOB_SYNC_SCHEDULE),
                    max_per_run=settings.JOB_SYNC_MAX_PER_SOURCE,
                )
            )
            added = True
        if added:
            await self.db.commit()

    async def due_sources(self, now: datetime | None = None) -> list[TaskRun]:
        """Enqueue one import per source whose cron slot has passed since its last
        enqueue. One run per (source, slot): a second scheduler tick is a no-op."""
        now = now or _now()
        sources = (await self.db.execute(select(JobSource))).scalars().all()
        runs: list[TaskRun] = []
        for source in sources:
            if not source.enabled or not source.permission_confirmed:
                continue
            try:
                raw_slot: datetime = croniter(source.cron, now).get_prev(datetime)
            except (ValueError, KeyError):
                logger.warning("Invalid cron for job source", source=source.name, cron=source.cron)
                continue
            slot = _aware(raw_slot)
            last = _aware(source.last_enqueued_at)
            if slot is None or (last is not None and last >= slot):
                continue
            run, created = await self.enqueue(
                TASK_IMPORT_SOURCE,
                {"source": source.name, "limit": source.max_per_run},
                idempotency_key=f"import:{source.name}:{slot.strftime('%Y%m%dT%H%M')}",
            )
            source.last_enqueued_at = now
            await self.db.commit()
            if created:
                runs.append(run)
        return runs

    async def record_import(
        self,
        source: str,
        run_id: uuid.UUID,
        *,
        ok: bool,
        error: str | None,
        cursor: dict[str, Any] | None,
    ) -> None:
        cp = await self.db.get(JobImportCheckpoint, source)
        if cp is None:
            cp = JobImportCheckpoint(source=source, cursor={}, consecutive_failures=0)
            self.db.add(cp)
        cp.last_run_id = run_id
        if ok:
            cp.last_success_at = _now()
            cp.last_error = None
            cp.consecutive_failures = 0
            if cursor is not None:
                cp.cursor = cursor
        else:
            cp.last_error = (error or "failed")[:500]
            cp.consecutive_failures += 1
        await self.db.commit()

    # ── heartbeats ───────────────────────────────────────────────────────────

    async def heartbeat(
        self, worker_id: str, kind: str, queues: list[str], active_runs: int = 0
    ) -> None:
        hb = await self.db.get(WorkerHeartbeat, worker_id)
        if hb is None:
            hb = WorkerHeartbeat(worker_id=worker_id, kind=kind)
            self.db.add(hb)
        hb.hostname = socket.gethostname()[:255]
        hb.queues = queues
        hb.active_runs = active_runs
        hb.last_seen_at = _now()
        await self.db.commit()

    async def liveness(self, stale_after: timedelta | None = None) -> dict[str, dict[str, Any]]:
        """Per kind: freshest heartbeat and whether it is stale."""
        stale_after = stale_after or timedelta(seconds=settings.WORKER_HEARTBEAT_STALE_SECONDS)
        now = _now()
        rows = (await self.db.execute(select(WorkerHeartbeat))).scalars().all()
        out: dict[str, dict[str, Any]] = {}
        for hb in rows:
            seen = _aware(hb.last_seen_at) or now
            age = (now - seen).total_seconds()
            entry = out.setdefault(hb.kind, {"count": 0, "fresh": 0, "newest_age_seconds": None})
            entry["count"] += 1
            if age <= stale_after.total_seconds():
                entry["fresh"] += 1
            if entry["newest_age_seconds"] is None or age < entry["newest_age_seconds"]:
                entry["newest_age_seconds"] = round(age, 1)
        return out
