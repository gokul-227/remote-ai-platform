from app.core.metrics import CELERY_QUEUE_DEPTH, CELERY_TASKS, HTTP_REQUESTS
from app.core.queue_monitor import QUEUE_NAMES


def test_observability_defines_http_and_task_metrics():
    assert HTTP_REQUESTS._name == "remote_ai_platform_http_requests"
    assert CELERY_TASKS._name == "remote_ai_platform_celery_tasks"
    assert CELERY_QUEUE_DEPTH._name == "remote_ai_platform_celery_queue_depth"
    assert QUEUE_NAMES == ("default", "jobs", "ai", "matching")
