"""
Celery application.

    celery -A app.worker.celery_app worker -Q default,imports --concurrency 2
    celery -A app.worker.celery_app beat

Redis is the broker only (no result backend): results and history live in
PostgreSQL (`app.domains.tasks`). Beat holds a PostgreSQL advisory lock so two
schedulers can never run at once (see beat_lock.py).
"""

from celery import Celery
from celery.schedules import crontab
from celery.signals import beat_init, worker_ready, worker_shutdown

from app.core.config import settings

celery_app = Celery("remote_ai_platform", broker=settings.redis_url, include=["app.worker.tasks"])

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_backend=None,
    task_ignore_result=True,
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,  # a killed worker's task is redelivered
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=100,
    broker_connection_retry_on_startup=True,
    # Above the longest task time limit (imports: 3500 s), so a running task is
    # never redelivered to a second worker.
    broker_transport_options={"visibility_timeout": 7200},
    task_default_queue="default",
    task_routes={"jobs.*": {"queue": "imports"}},
    task_always_eager=settings.TASKS_ALWAYS_EAGER,
    task_soft_time_limit=1800,
    task_time_limit=2100,
    beat_schedule={
        "tick-schedule": {"task": "tasks.tick_schedule", "schedule": 60.0},
        "dispatch-outbox": {"task": "tasks.dispatch_outbox", "schedule": 10.0},
        "requeue-stale": {"task": "tasks.requeue_stale", "schedule": 300.0},
        "maintain-catalogue": {
            "task": "jobs.maintain_catalogue_scheduled",
            "schedule": crontab(hour=3, minute=20),
        },
        "flush-email-outbox": {
            "task": "notifications.flush_email_outbox_scheduled",
            "schedule": 60.0,
        },
        "prune-runs": {"task": "tasks.prune_runs", "schedule": crontab(hour=4, minute=5)},
        "send-digests": {"task": "notifications.send_digests", "schedule": 300.0},
        "sweep-file-trash": {"task": "files.sweep_trash", "schedule": crontab(hour=4, minute=30)},
        "daily-import-summary": {
            "task": "ops.daily_import_summary",
            "schedule": crontab(hour=7, minute=0),
        },
        "discover-job-boards": {
            "task": "jobs.discover_boards_scheduled",
            "schedule": crontab(hour="*/6", minute=50),
        },
        "check-backups": {"task": "ops.check_backups", "schedule": crontab(hour=8, minute=0)},
        "job-alerts": {"task": "jobs.send_alerts", "schedule": crontab(minute=40)},
        "refresh-catalogue-stats": {
            "task": "jobs.refresh_catalogue_stats",
            "schedule": settings.JOB_STATS_REFRESH_MINUTES * 60.0,
        },
        "backfill-job-filters": {
            "task": "jobs.backfill_filters",
            "schedule": crontab(hour=2, minute=50),
        },
        "billing-message-refunds": {
            "task": "billing.refund_unanswered_messages",
            "schedule": crontab(hour=5, minute=10),
        },
        "cost-guard":{"task": "ops.cost_guard", "schedule": crontab(hour="*/6", minute=15)},
        "seo-indexing-sweep": {
            "task": "seo.indexing_sweep",
            "schedule": crontab(hour="*/4", minute=25),
        },
        "daily-kpi-digest": {"task": "ops.daily_kpi_digest", "schedule": crontab(hour=7, minute=5)},
        "seo-weekly-report": {
            "task": "ops.seo_weekly_report",
            "schedule": crontab(day_of_week=1, hour=7, minute=30),
        },
    },
)


@beat_init.connect
def _acquire_beat_lock(**_: object) -> None:
    from app.worker.beat_lock import acquire_or_exit

    acquire_or_exit()
    from app.worker.monitoring import start_monitor

    start_monitor("scheduler")


@worker_ready.connect
def _worker_ready(sender=None, **_: object) -> None:  # noqa: ANN001
    from app.worker.monitoring import start_monitor

    queues = (
        sorted(queue.name for queue in sender.task_consumer.queues) if sender is not None else []
    )
    start_monitor("worker", queues)


@worker_shutdown.connect
def _worker_shutdown(**_: object) -> None:
    from app.worker.monitoring import stop_monitor
    from app.worker.runtime import shutdown

    stop_monitor()
    shutdown()
