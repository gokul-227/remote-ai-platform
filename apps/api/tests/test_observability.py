from app.core.metrics import HTTP_REQUESTS


def test_observability_defines_http_metrics():
    assert HTTP_REQUESTS._name == "remote_ai_platform_http_requests"


async def test_request_metric_is_labelled_by_route_template_not_raw_path(client):
    import uuid

    await client.get(f"/api/v1/jobs/{uuid.uuid4()}")
    labels = {s.labels["path"] for m in HTTP_REQUESTS.collect() for s in m.samples}
    assert any(label.endswith("/jobs/{job_id}") for label in labels), labels
    assert not any(label.count("-") >= 4 for label in labels), labels


def test_public_health_errors_are_generic_in_production(monkeypatch):
    from app.core import health
    from app.core.config import settings

    monkeypatch.setattr(settings, "APP_ENV", "production")
    assert health._public_error(RuntimeError("postgres://user:secret@db:5432 refused")) == "unavailable"
