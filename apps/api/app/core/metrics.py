"""Application metrics."""

from prometheus_client import Counter

HTTP_REQUESTS = Counter(
    "remote_ai_platform_http_requests_total",
    "Completed HTTP requests.",
    ("method", "path", "status"),
)
