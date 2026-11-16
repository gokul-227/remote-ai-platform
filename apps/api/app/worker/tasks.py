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
    TASK_DISCOVER_BOARDS,
    TASK_FLUSH_EMAIL_OUTBOX,
    TASK_IMPORT_SOURCE,
    TASK_MAINTAIN_CATALOGUE,
    TASK_OUTBOX_EVENT,
    TASK_VALIDATE_BOARDS,
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
        from app.domains.tasks.models import JobImportCheckpoint

        async with factory() as db:
            cp = await db.get(JobImportCheckpoint, source)
            previous = dict((cp.cursor or {}).get("incremental") or {}) if cp else {}
            service = JobService(JobRepository(db))
            stats = await service.sync_all_job_sources(
                limit_per_source=limit or settings.JOB_SYNC_MAX_PER_SOURCE,
                admin_repo=AdminRepository(db),
                source_name=source,
                run_maintenance=False,
                raise_on_failure=True,
                cursors={source: previous},
            )
        # The incremental checkpoint moves only after a successful run.
        incremental = service.next_cursors.get(source, previous)
        async with factory() as db:
            await TaskService(db).record_import(
                source,
                run_id,
                ok=True,
                error=None,
                cursor={"last_stats": stats, "incremental": incremental},
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
                from app.services import slack

                await slack.post(
                    "job_imports",
                    f":warning: Job import {source} failed ({run.status.lower()}, "
                    f"attempt {run.attempts}/{run.max_attempts})",
                    dedup_key=f"import-fail:{source}:{run.status}",
                    fields={"run_id": str(run_id), "error": (run.error or "")[:300]},
                    actions=slack.alert_buttons(
                        slack.button("Run now", "rap_alert", f"cmd:sources run {source}"),
                        slack.button("Pause source", "rap_alert", f"cmd:sources pause {source}"),
                    ),
                )


async def _task_run_model():  # noqa: ANN202
    from app.domains.tasks.models import TaskRun

    return TaskRun


# Big catalogue sweeps: fetching stops at JOB_IMPORT_FETCH_BUDGET_SECONDS, saving
# needs the rest; still inside the 3-hour slot.
@shared_task(name=TASK_IMPORT_SOURCE, bind=True, soft_time_limit=3300, time_limit=3500)
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
            stats = await JobService(JobRepository(db)).maintain_catalogue()
            await db.commit()
            # Retry identity-provider erasures that failed at account deletion (DATA-04).
            from app.domains.auth.erasure import retry_pending_erasures

            erasures = await retry_pending_erasures(db)
            await db.commit()
            return {**stats, "identity_erasures_pending": erasures["pending"]}

    return await _with_run(run_id, work)


async def validate_boards_async(run_id: uuid.UUID, source: str, limit: int = 100) -> dict[str, Any]:
    """Staff-started, rate-limited check of an ATS source's company boards."""
    from app.domains.jobs.board_validation import validate_boards

    factory = runtime.session_factory()

    async def work() -> dict[str, Any]:
        async with factory() as db:
            counts = await validate_boards(db, source, limit)
        return {"source": source, "checked": sum(counts.values()), **counts}

    return await _with_run(run_id, work)


async def discover_boards_async(run_id: uuid.UUID) -> dict[str, Any]:
    """ATS board discovery (board_discovery.py); reports to Slack #job-imports."""
    from app.domains.jobs.board_discovery import run_discovery
    from app.services import slack

    factory = runtime.session_factory()

    async def work() -> dict[str, Any]:
        async with factory() as db:
            return await run_discovery(db)

    result = await _with_run(run_id, work)
    if "error" in result:
        await slack.post(
            "job_imports",
            ":warning: Board discovery failed",
            dedup_key=f"discovery-fail:{run_id}",
            fields={"error": str(result["error"])[:300]},
        )
    elif not result.get("skipped"):
        await slack.post(
            "job_imports",
            f":mag: Board discovery: {result.get('new_candidates', 0)} new boards found, "
            f"{result.get('validated_checked', 0)} validated, "
            f"{result.get('validated_promoted', 0)} added "
            f"({result.get('validated_promoted_jobs', 0)} jobs listed), "
            f"{result.get('validated_dead', 0)} dead",
            dedup_key=f"discovery:{run_id}",
            fields={
                "live boards": result.get("boards_live"),
                "candidates pending": result.get("candidates_pending"),
                "jobs scanned": result.get("jobs_scanned"),
                "not found / blocked / errors": (
                    f"{result.get('validated_not_found', 0)} / "
                    f"{result.get('validated_robots_blocked', 0)} / "
                    f"{result.get('validated_error', 0)}"
                ),
                "seconds": result.get("seconds"),
            },
        )
    return result


@shared_task(name=TASK_DISCOVER_BOARDS, soft_time_limit=3300, time_limit=3500)
def discover_boards_task(run_id: str, **_: Any) -> dict[str, Any]:
    return runtime.run(discover_boards_async(_uuid(run_id)))


@shared_task(name="jobs.discover_boards_scheduled")
def discover_boards_scheduled() -> dict[str, Any]:
    if not settings.JOB_BOARD_DISCOVERY_ENABLED:
        return {"skipped": "disabled"}

    async def go() -> dict[str, Any]:
        from datetime import UTC, datetime

        slot = datetime.now(UTC).strftime("%Y%m%dT%H")
        async with runtime.session_factory()() as db:
            run, created = await TaskService(db).enqueue(
                TASK_DISCOVER_BOARDS, {}, idempotency_key=f"discover-boards:{slot}"
            )
            return {"run_id": str(run.id), "created": created}

    return runtime.run(go())


@shared_task(name=TASK_VALIDATE_BOARDS)
def validate_boards_task(run_id: str, source: str, limit: int = 100, **_: Any) -> dict[str, Any]:
    return runtime.run(validate_boards_async(_uuid(run_id), source, limit))


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


# ── external reading ("From around the web") ────────────────────────────────


async def import_news_async(run_id: uuid.UUID, source: str, fetch: Any = None) -> dict[str, Any]:
    from app.domains.social.news import import_news

    factory = runtime.session_factory()

    async def work() -> dict[str, Any]:
        async with factory() as db:
            stats = await import_news(db, source, fetch)
        async with factory() as db:
            await TaskService(db).record_import(
                source, run_id, ok=True, error=None, cursor={"last_stats": stats}
            )
        return stats

    result = await _with_run(run_id, work)
    if "error" in result:
        async with factory() as db:
            await TaskService(db).record_import(
                source, run_id, ok=False, error=str(result["error"]), cursor=None
            )
    return result


@shared_task(name="news.import_source")
def import_news_task(run_id: str, source: str, **_: Any) -> dict[str, Any]:
    return runtime.run(import_news_async(_uuid(run_id), source))


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
        await service.ensure_news_sources()
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


# ── owner notifications (Slack) ─────────────────────────────────────────────


@shared_task(name="ops.daily_import_summary")
def daily_import_summary() -> dict[str, Any]:
    from app.worker import ops

    async def go() -> dict[str, Any]:
        async with runtime.session_factory()() as db:
            return await ops.daily_import_summary(db)

    return runtime.run(go())


@shared_task(name="ops.check_backups")
def check_backups() -> dict[str, Any]:
    from app.worker import ops

    async def go() -> dict[str, Any]:
        async with runtime.session_factory()() as db:
            return await ops.check_backups(db)

    return runtime.run(go())


@shared_task(name="ops.cost_guard")
def cost_guard() -> dict[str, Any]:
    from app.worker import ops

    async def go() -> dict[str, Any]:
        async with runtime.session_factory()() as db:
            return await ops.cost_guard(db)

    return runtime.run(go())


@shared_task(name="ops.seo_weekly_report")
def seo_weekly_report() -> dict[str, Any]:
    from app.worker import ops

    return runtime.run(ops.seo_weekly_report())


@shared_task(name="seo.indexing_sweep")
def seo_indexing_sweep() -> dict[str, Any]:
    from app.services.search.indexing import sweep_unannounced

    async def go() -> dict[str, Any]:
        async with runtime.session_factory()() as db:
            return await sweep_unannounced(db)

    return runtime.run(go())


# ── job search filters ──────────────────────────────────────────────────────


async def backfill_job_filters_async(batch_size: int = 1000, max_batches: int = 20) -> dict[str, Any]:
    from app.domains.jobs.backfill import backfill_filters

    async with runtime.session_factory()() as db:
        return await backfill_filters(db, batch_size=batch_size, max_batches=max_batches)


@shared_task(name="jobs.backfill_filters")
def backfill_job_filters(batch_size: int = 1000, max_batches: int = 20) -> dict[str, Any]:
    """Derive filter columns for stored jobs in batches (migration 074). Requeues
    itself until every row is on the current rule version; Beat starts it
    nightly so a rule change (DERIVE_VERSION bump) heals on its own."""
    result = runtime.run(backfill_job_filters_async(batch_size, max_batches))
    if not result.get("complete"):
        backfill_job_filters.apply_async(kwargs={"batch_size": batch_size}, countdown=5)
    return result


@shared_task(name="jobs.refresh_catalogue_stats")
def refresh_catalogue_stats() -> dict[str, Any]:
    """Precomputed facets for common searches + the employer read model (075)."""

    async def go() -> dict[str, Any]:
        from app.domains.jobs.repository import JobRepository
        from app.domains.jobs.service import JobService

        async with runtime.session_factory()() as db:
            return await JobService(JobRepository(db)).refresh_catalogue_stats()

    return runtime.run(go())


@shared_task(name="jobs.send_alerts")
def send_job_alerts() -> dict[str, Any]:
    async def go() -> dict[str, Any]:
        from app.domains.jobs.saved_searches import send_job_alerts as _send

        async with runtime.session_factory()() as db:
            return await _send(db)

    return runtime.run(go())


async def refund_unanswered_messages_async() -> dict[str, Any]:
    from app.domains.billing.placements import refund_unanswered_messages as sweep

    if not settings.BILLING_ENABLED:
        return {"skipped": True}
    async with runtime.session_factory()() as db:
        result = await sweep(db)
        await db.commit()
        return dict(result)


@shared_task(name="billing.refund_unanswered_messages")
def refund_unanswered_messages() -> dict[str, Any]:
    """Return messaging credits for first messages with no reply in 14 days."""
    return runtime.run(refund_unanswered_messages_async())


@shared_task(name="slack.run_command", soft_time_limit=120, time_limit=150)
def slack_run_command(**kwargs: Any) -> dict[str, Any]:
    """/rap work queued by app/domains/slack/router.py; answers via response_url."""
    from app.domains.slack.service import run as run_slack

    message = runtime.run(run_slack(**kwargs))
    return {"text": str(message.get("text", ""))[:200]}


@shared_task(name="ops.daily_kpi_digest")
def daily_kpi_digest() -> dict[str, Any]:
    from app.worker import ops

    async def go() -> dict[str, Any]:
        async with runtime.session_factory()() as db:
            return await ops.daily_kpi_digest(db)

    return runtime.run(go())
