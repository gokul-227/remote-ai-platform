"""
Celery Application Factory — Remote AI Platform Background Workers
"""

from celery import Celery
from celery.schedules import crontab
from celery.signals import task_failure, task_postrun, task_prerun
import time

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
        CELERY_TASK_DURATION.labels(task=task.name, queue=queue).observe(time.perf_counter() - started)


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
        task_soft_time_limit=300,      # 5 minutes soft limit
        task_time_limit=600,           # 10 minutes hard limit
        # Worker
        worker_prefetch_multiplier=1,  # Fair queue — important for long tasks
        worker_max_tasks_per_child=50, # Restart workers periodically to avoid memory leaks
        # Results
        result_expires=86400,          # 24 hours
        # Queues
        task_queues={
            "default": {},
            "jobs": {"exchange": "jobs"},      # Job aggregation tasks
            "ai": {"exchange": "ai"},           # AI processing tasks
            "matching": {"exchange": "matching"}, # Match score computation
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


celery_app = create_celery_app()
