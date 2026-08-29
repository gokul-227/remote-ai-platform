"""
Celery Application Factory — Remote AI Platform Background Workers

The Celery app is intentionally created lazily. On the web service (Render
free tier, Vercel, etc.) where no Redis broker is available, importing this
module does NOT attempt to connect to localhost:6379. Connection is only
attempted when a real worker process explicitly calls `get_celery_app()`.
"""

import os
import time

from celery import Celery
from celery.schedules import crontab
from celery.signals import task_failure, task_postrun, task_prerun

from app.core.config import settings
from app.core.metrics import CELERY_TASK_DURATION, CELERY_TASKS

_task_start_times: dict[str, float] = {}


@task_prerun.connect
def record_task_start(task_id=None, task=None, **kwargs):
    if task_id:
        _task_start_times[task_id] = time.perf_counter()


@task_postrun.connect
def record_task_success(task_id=None, task=None, state=None, **kwargs):
    if task is None:
        return
    queue = getattr(task.request, "delivery_info", {}).get("routing_key", "default")
    CELERY_TASKS.labels(task=task.name, queue=queue, status=state or "SUCCESS").inc()
    started = _task_start_times.pop(task_id, None) if task_id else None
    if started is not None:
        CELERY_TASK_DURATION.labels(task=task.name, queue=queue).observe(
            time.perf_counter() - started
        )


@task_failure.connect
def record_task_failure(task_id=None, task=None, **kwargs):
    if task is None:
        return
    queue = getattr(task.request, "delivery_info", {}).get("routing_key", "default")
    CELERY_TASKS.labels(task=task.name, queue=queue, status="FAILURE").inc()
    _task_start_times.pop(task_id, None)


def create_celery_app() -> Celery:
    app = Celery(
        "remote-ai-platform",
        broker=settings.CELERY_BROKER_URL,
        backend=settings.CELERY_RESULT_BACKEND,
        include=[
            "app.workers.tasks.jobs",
            "app.workers.tasks.ai",
            "app.workers.tasks.matching",
        ],
    )

    app.conf.update(
        # Broker resilience & connection handling
        broker_connection_retry_on_startup=True,
        broker_connection_max_retries=5,
        broker_transport_options={
            "socket_timeout": 3.0,
            "socket_connect_timeout": 3.0,
            "max_connections": 10,
        },
        # Serialization
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        # Timezone
        timezone="UTC",
        enable_utc=True,
        # Task behavior
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        task_track_started=True,
        task_soft_time_limit=300,  # 5 minutes soft limit
        task_time_limit=600,  # 10 minutes hard limit
        # Worker
        worker_prefetch_multiplier=1,  # Fair queue — important for long tasks
        worker_max_tasks_per_child=50,  # Restart workers periodically to avoid memory leaks
        # Results
        result_expires=86400,  # 24 hours
        # Queues
        task_queues={
            "default": {},
            "jobs": {"exchange": "jobs"},  # Job aggregation tasks
            "ai": {"exchange": "ai"},  # AI processing tasks
            "matching": {"exchange": "matching"},  # Match score computation
        },
        task_default_queue="default",
        # Beat schedule (cron jobs)
        beat_schedule={
            "sync-all-job-sources": {
                "task": "app.workers.tasks.jobs.sync_all_sources",
                "schedule": crontab(minute=0, hour="*/6"),  # Every 6 hours
                "options": {"queue": "jobs"},
            },
            "refresh-trending-skills": {
                "task": "app.workers.tasks.jobs.refresh_trending_skills",
                "schedule": crontab(minute=0, hour="*/12"),  # Every 12 hours
                "options": {"queue": "jobs"},
            },
            "compute-stale-matches": {
                "task": "app.workers.tasks.matching.compute_stale_matches",
                "schedule": crontab(minute=0, hour=2),  # Daily at 2am
                "options": {"queue": "matching"},
            },
        },
    )

    return app


# ---------------------------------------------------------------------------
# Lazy singleton — only constructed when a real broker is reachable.
#
# The web service (Render free tier) runs without a Redis broker.  Eagerly
# creating the Celery app at import time would cause connection-refused errors
# and log noise on every cold-start.  Worker processes set the CELERY_WORKER=1
# env var, or the broker URL must not be a localhost address, to get a real app.
# ---------------------------------------------------------------------------

_celery_app: Celery | None = None


def _broker_is_available() -> bool:
    """Return True when a non-localhost broker URL is configured or we're explicitly
    running as a Celery worker process."""
    in_worker = bool(os.environ.get("CELERY_WORKER"))
    broker_is_external = not settings.CELERY_BROKER_URL.startswith("redis://localhost")
    return in_worker or broker_is_external


def get_celery_app() -> Celery:
    """Return (and lazily create) the Celery application.

    Raises RuntimeError if called from a web-service context where no broker
    is configured, to give a clear error instead of a cryptic connection refusal.
    """
    global _celery_app
    if _celery_app is None:
        if not _broker_is_available():
            raise RuntimeError(
                "Celery broker is not configured for this environment. "
                "Set CELERY_BROKER_URL to a hosted Redis URL or set CELERY_WORKER=1 "
                "when running a dedicated worker process."
            )
        _celery_app = create_celery_app()
    return _celery_app


# Expose `celery_app` at module level for Celery CLI and task decorator
# (@celery_app.task) compatibility. In web-service deployments without a
# broker this will be None; task modules guard against that with get_celery_app().
celery_app: Celery | None = create_celery_app() if _broker_is_available() else None
