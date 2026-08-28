"""
Tests for Tiered Rate Limiting and Throttling.
"""

import pytest
from httpx import AsyncClient
from app.core.rate_limiter import check_rate_limit, TIER_AUTH


@pytest.mark.asyncio
async def test_rate_limiter_allows_and_throttles():
    import app.core.rate_limiter as rl
    rl._TESTING = False
    rl.reset_fallback_state()
    try:
        identifier = "test_rate_client_ip_999"
        path = "/api/v1/auth/login"
        limit, window = TIER_AUTH

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
    finally:
        rl._TESTING = True
        rl.reset_fallback_state()


@pytest.mark.asyncio
async def test_rate_limit_exempt_health_endpoints():
    identifier = "health_check_probe"
    path = "/health/live"

    for _ in range(200):
        allowed, remaining, _ = await check_rate_limit(identifier, path)
        assert allowed is True
