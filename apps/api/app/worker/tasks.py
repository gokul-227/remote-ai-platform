"""
Celery tasks. Each task is a thin synchronous wrapper around an async function
that the tests call directly (`*_async`), using `runtime.session_factory()`.

Every task that has a `task_runs` row takes `run_id` and moves it through
STARTED -> SUCCEEDED | RETRYING | DEAD. Scheduler ticks (no run row) are cheap
housekeeping and simply log.
"""

import uuid
from datetime import timedelta
from typing import Any

from celery import shared_task

from app.core.config import settings
from app.core.logging import get_logger
from app.domains.tasks.models import TASK_RETRYING
from app.domains.tasks.service import (
    TASK_FLUSH_EMAIL_OUTBOX,
    TASK_IMPORT_SOURCE,
    TASK_MAINTAIN_CATALOGUE,
    TASK_OUTBOX_EVENT,
    TaskService,
)
from app.worker import runtime

logger = get_logger(__name__)


def _uuid(value: str | uuid.UUID) -> uuid.UUID:
    return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


async def _with_run(run_id: uuid.UUID, work) -> dict[str, Any]:  # noqa: ANN001
    """Lifecycle wrapper: STARTED, then SUCCEEDED or failure handling."""
    factory = runtime.session_factory()
    async with factory() as db:
        service = TaskService(db)
        run = await service.mark_started(run_id, runtime.worker_id())
        if run is None:
            logger.warning("Task run missing; nothing to do", run_id=str(run_id))
            return {"skipped": True}
    try:
        result = await work()
    except Exception as exc:
        error = f"{type(exc).__name__}: {str(exc)[:300]}"
        async with factory() as db:
            service = TaskService(db)
            status, _ = await service.mark_failed(run_id, error)
            if status == TASK_RETRYING:
                run = await db.get(type(run), run_id)
                if run is not None:
                    await service.redispatch_retry(run)
        logger.error("Task failed", run_id=str(run_id), status=status, error=error)
        return {"error": error, "status": status}
    async with factory() as db:
        await TaskService(db).mark_succeeded(run_id, result)
    return result


# ── job imports ──────────────────────────────────────────────────────────────


async def import_source_async(
    run_id: uuid.UUID, source: str, limit: int | None = None
) -> dict[str, Any]:
    from app.domains.admin.repository import AdminRepository
    from app.domains.jobs.repository import JobRepository
    from app.domains.jobs.service import JobService

    factory = runtime.session_factory()

    async def work() -> dict[str, Any]:
        async with factory() as db:
            stats = await JobService(JobRepository(db)).sync_all_job_sources(
                limit_per_source=limit or settings.JOB_SYNC_MAX_PER_SOURCE,
                admin_repo=AdminRepository(db),
                source_name=source,
                run_maintenance=False,
                raise_on_failure=True,
            )
        async with factory() as db:
            await TaskService(db).record_import(
                source, run_id, ok=True, error=None, cursor={"last_stats": stats}
            )
        return {"source": source, "saved": stats.get(source, 0)}

    try:
        return await _with_run(run_id, work)
    finally:
        async with factory() as db:
            run = await db.get((await _task_run_model()), run_id)
            if run is not None and run.status in {"RETRYING", "DEAD"}:
                await TaskService(db).record_import(
                    source, run_id, ok=False, error=run.error, cursor=None
                )


async def _task_run_model():  # noqa: ANN202
    from app.domains.tasks.models import TaskRun

    return TaskRun


@shared_task(name=TASK_IMPORT_SOURCE, bind=True)
def import_source(
    self, run_id: str, source: str, limit: int | None = None, **_: Any
) -> dict[str, Any]:  # noqa: ANN001
    return runtime.run(import_source_async(_uuid(run_id), source, limit))


async def maintain_catalogue_async(run_id: uuid.UUID) -> dict[str, Any]:
    from app.domains.jobs.repository import JobRepository
    from app.domains.jobs.service import JobService

    factory = runtime.session_factory()

    async def work() -> dict[str, Any]:
        async with factory() as db:
            return await JobService(JobRepository(db)).maintain_catalogue()

    return await _with_run(run_id, work)


@shared_task(name=TASK_MAINTAIN_CATALOGUE)
def maintain_catalogue(run_id: str, **_: Any) -> dict[str, Any]:
    return runtime.run(maintain_catalogue_async(_uuid(run_id)))


@shared_task(name="jobs.maintain_catalogue_scheduled")
def maintain_catalogue_scheduled() -> dict[str, Any]:
    async def go() -> dict[str, Any]:
        async with runtime.session_factory()() as db:
            run, created = await TaskService(db).enqueue(
                TASK_MAINTAIN_CATALOGUE, {}, idempotency_key=f"maintenance:{_day_slot()}"
            )
            return {"run_id": str(run.id), "created": created}

    return runtime.run(go())


def _day_slot() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).strftime("%Y%m%d")


# ── outbox and notifications ────────────────────────────────────────────────


async def flush_email_outbox_async(run_id: uuid.UUID | None = None) -> dict[str, Any]:
    from app.services.email.outbox import dispatch_due

    factory = runtime.session_factory()

    async def work() -> dict[str, Any]:
        async with factory() as db:
            return await dispatch_due(db, limit=50)

    if run_id is None:
        return await work()
    return await _with_run(run_id, work)


@shared_task(name=TASK_FLUSH_EMAIL_OUTBOX)
def flush_email_outbox(run_id: str, **_: Any) -> dict[str, Any]:
    return runtime.run(flush_email_outbox_async(_uuid(run_id)))


@shared_task(name="notifications.flush_email_outbox_scheduled")
def flush_email_outbox_scheduled() -> dict[str, Any]:
    return runtime.run(flush_email_outbox_async(None))


async def handle_outbox_event_async(
    run_id: uuid.UUID, event_type: str, **payload: Any
) -> dict[str, Any]:
    async def work() -> dict[str, Any]:
        logger.info("Outbox event without a handler", event_type=event_type)
        return {"event_type": event_type, "handled": False}

    return await _with_run(run_id, work)


@shared_task(name=TASK_OUTBOX_EVENT)
def handle_outbox_event(run_id: str, event_type: str, **payload: Any) -> dict[str, Any]:
    return runtime.run(handle_outbox_event_async(_uuid(run_id), event_type, **payload))


# ── scheduler housekeeping (no run rows) ────────────────────────────────────


async def tick_schedule_async() -> dict[str, Any]:
    from app.domains.jobs.service import AGGREGATORS

    async with runtime.session_factory()() as db:
        service = TaskService(db)
        await service.ensure_sources([a.source_name for a in AGGREGATORS])
        runs = await service.due_sources()
        return {"enqueued": [r.args.get("source") for r in runs]}


@shared_task(name="tasks.tick_schedule")
def tick_schedule() -> dict[str, Any]:
    return runtime.run(tick_schedule_async())


@shared_task(name="tasks.dispatch_outbox")
def dispatch_outbox() -> dict[str, Any]:
    async def go() -> dict[str, Any]:
        async with runtime.session_factory()() as db:
            return {"dispatched": await TaskService(db).dispatch_outbox()}

    return runtime.run(go())


@shared_task(name="tasks.requeue_stale")
def requeue_stale() -> dict[str, Any]:
    async def go() -> dict[str, Any]:
        async with runtime.session_factory()() as db:
            return {"requeued": await TaskService(db).requeue_stale()}

    return runtime.run(go())


@shared_task(name="tasks.prune_runs")
def prune_runs() -> dict[str, Any]:
    async def go() -> dict[str, Any]:
        async with runtime.session_factory()() as db:
            return {
                "pruned": await TaskService(db).prune(
                    timedelta(days=settings.TASK_RUN_RETENTION_DAYS)
                )
            }

    return runtime.run(go())


@shared_task(name="notifications.send_digests")
def send_digests() -> dict[str, Any]:
    async def go() -> dict[str, Any]:
        from app.domains.notifications.preferences import build_digests

        async with runtime.session_factory()() as db:
            return await build_digests(db)

    return runtime.run(go())


@shared_task(name="files.sweep_trash")
def sweep_trash() -> dict[str, Any]:
    async def go() -> dict[str, Any]:
        from app.domains.files.router import sweep_trash as _sweep

        async with runtime.session_factory()() as db:
            return await _sweep(db, settings.FILES_TRASH_RETENTION_DAYS)

    return runtime.run(go())


async def send_push_async(
    run_id: uuid.UUID, aggregate_id: str, payload: dict[str, Any]
) -> dict[str, Any]:
    from app.domains.notifications.push import send_push

    factory = runtime.session_factory()

    async def work() -> dict[str, Any]:
        async with factory() as db:
            return await send_push(
                db,
                uuid.UUID(aggregate_id),
                str(payload.get("title", "")),
                str(payload.get("body", "")),
                str(payload.get("link", "#notifications")),
            )

    return await _with_run(run_id, work)


@shared_task(name="notifications.send_push")
def send_push_task(
    run_id: str, aggregate_id: str, payload: dict[str, Any] | None = None, **_: Any
) -> dict[str, Any]:
    return runtime.run(send_push_async(_uuid(run_id), aggregate_id, payload or {}))
