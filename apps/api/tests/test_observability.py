from app.core.metrics import HTTP_REQUESTS


def test_observability_defines_http_metrics():
    assert HTTP_REQUESTS._name == "remote_ai_platform_http_requests"
