"""Application and Celery metrics shared by API and worker processes."""

from prometheus_client import Counter, Gauge, Histogram

HTTP_REQUESTS = Counter(
    "remote_ai_platform_http_requests_total",
    "Completed HTTP requests.",
    ("method", "path", "status"),
)
CELERY_TASKS = Counter(
    "remote_ai_platform_celery_tasks_total",
    "Celery task outcomes.",
    ("task", "queue", "status"),
)
CELERY_TASK_DURATION = Histogram(
    "remote_ai_platform_celery_task_duration_seconds",
    "Celery task execution duration.",
    ("task", "queue"),
)
CELERY_QUEUE_DEPTH = Gauge(
    "remote_ai_platform_celery_queue_depth",
    "Approximate Redis-backed Celery queue depth.",
    ("queue",),
)
