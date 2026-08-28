import pytest
import uuid
from httpx import AsyncClient
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
