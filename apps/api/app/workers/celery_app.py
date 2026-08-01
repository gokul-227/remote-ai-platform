"""
Celery Application Factory — WorkMesh AI Background Workers
"""

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings


def create_celery_app() -> Celery:
    app = Celery(
        "workmesh",
        broker=settings.CELERY_BROKER_URL,
        backend=settings.CELERY_RESULT_BACKEND,
        include=[
            "app.workers.tasks.jobs",
            "app.workers.tasks.ai",
            "app.workers.tasks.matching",
        ],
    )

    app.conf.update(
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
