import uuid

import pytest

from app.core.rate_limiter import check_rate_limit, get_route_tier


@pytest.mark.asyncio
async def test_rate_limiter_allows_and_throttles(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "RATE_LIMIT_MAX_REQUESTS", 5)
    identifier = f"test_rate_{uuid.uuid4().hex}"
    path = "/api/v1/auth/login"
    tier = get_route_tier(path)
    assert tier is not None
    limit, window = tier
    assert limit == 5

    # First N calls within limit should succeed
    for _ in range(limit):
        allowed, remaining, retry_after = await check_rate_limit(identifier, path)
        assert allowed is True
        assert retry_after == 0

    # Call N + 1 should be throttled
    throttled, remaining, retry_after = await check_rate_limit(identifier, path)
    assert throttled is False
    assert remaining == 0
    assert retry_after > 0


@pytest.mark.asyncio
async def test_rate_limit_exempt_health_endpoints():
    identifier = "health_check_probe"
    path = "/health/live"

    for _ in range(200):
        allowed, remaining, _ = await check_rate_limit(identifier, path)
        assert allowed is True


def test_resume_and_ai_enhance_get_the_stricter_ai_tier(monkeypatch):
    """
    Regression test: /api/v1/engineers/me/resume and /me/ai-enhance both
    synchronously invoke an LLM (ResumeParserAgent / the AI-enhance flow) --
    real $ cost per call -- but previously fell through to the loose default
    "general" tier (base_limit * 10) alongside routine CRUD/read endpoints,
    since AI_CALL_ROUTE_PREFIXES didn't cover the engineers domain at all.
    """
    from app.core.config import settings

    monkeypatch.setattr(settings, "RATE_LIMIT_MAX_REQUESTS", 10)
    general_tier = get_route_tier("/api/v1/engineers/me", "GET")
    resume_tier = get_route_tier("/api/v1/engineers/me/resume", "POST")
    ai_enhance_tier = get_route_tier("/api/v1/engineers/me/ai-enhance", "POST")

    assert general_tier == (100, 60)
    assert resume_tier == (30, 60)
    assert ai_enhance_tier == (30, 60)
    assert resume_tier[0] < general_tier[0]
    assert ai_enhance_tier[0] < general_tier[0]


def test_project_ai_endpoints_get_the_stricter_ai_tier(monkeypatch):
    """
    Regression test: the projects domain's AI report endpoints (plan
    generation, progress-summary, risk-analysis, documentation, and
    submission ai-review) each call AIService()/an AI agent synchronously,
    but have a variable {project_id}/{submission_id} path segment so can't be
    matched by a plain prefix -- verify the suffix-based match picks them up.
    """
    from app.core.config import settings

    monkeypatch.setattr(settings, "RATE_LIMIT_MAX_REQUESTS", 10)
    project_id = uuid.uuid4()

    for suffix in (
        f"/{project_id}/plan",
        f"/{project_id}/ai/progress-summary",
        f"/{project_id}/ai/risk-analysis",
        f"/{project_id}/ai/documentation",
        f"/submissions/{project_id}/ai-review",
    ):
        path = f"/api/v1/projects{suffix}"
        assert get_route_tier(path, "POST") == (30, 60), path

    # A GET to the same path (e.g. listing) must not get pulled into the AI
    # tier -- only the AI-triggering POST should.
    assert get_route_tier(f"/api/v1/projects/{project_id}/plan", "GET") == (100, 60)


def test_job_creation_post_is_ai_tier_but_job_listing_is_not(monkeypatch):
    """POST /api/v1/jobs triggers JobEnricherAgent; GET does not."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "RATE_LIMIT_MAX_REQUESTS", 10)
    assert get_route_tier("/api/v1/jobs", "POST") == (30, 60)
    assert get_route_tier("/api/v1/jobs", "GET") == (100, 60)
