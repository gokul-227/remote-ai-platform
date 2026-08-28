"""
Distributed Redis-Backed Rate Limiting with In-Memory Fallback.
Provides tiered rate limits across Authentication, AI, and Public endpoints.
"""

import time
from collections import defaultdict, deque
from typing import Optional, Tuple
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import settings

# Route tiers: (limit_requests, window_seconds)
TIER_AUTH = (10, 60)
TIER_AI = (30, 60)
TIER_GENERAL = (120, 60)

# In-memory fallback state
_fallback_windows: dict[str, deque[float]] = defaultdict(deque)


def reset_fallback_state() -> None:
    """Clear in-memory rate-limit counters. Call between tests to prevent state bleed."""
    _fallback_windows.clear()


def get_route_tier(path: str) -> Optional[Tuple[int, int]]:
    # Exempt internal/diagnostic routes
    if path in {"/health", "/health/live", "/health/ready", "/health/dependencies", "/api/v1/health", "/metrics", "/docs", "/redoc", "/openapi.json"}:
        return None

    base_limit = settings.RATE_LIMIT_MAX_REQUESTS
    window = settings.RATE_LIMIT_WINDOW_SECONDS

    if any(path.startswith(p) for p in ("/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/forgot-password", "/api/v1/auth/reset-password")):
        return (base_limit, window)

    if any(path.startswith(p) for p in ("/api/v1/quality", "/api/v1/matching", "/quality")):
        return (base_limit * 3, window)

    return (base_limit * 10, window)


async def check_rate_limit(
    identifier: str,
    path: str,
) -> Tuple[bool, int, int]:
    """
    Check rate limit for client identifier on path.
    Returns: (is_allowed, remaining_requests, retry_after_seconds)
    """
    tier = get_route_tier(path)
    if tier is None:
        return True, 9999, 0

    max_requests, window_seconds = tier
    now = time.time()
    key = f"ratelimit:{identifier}:{path}"

    # 1. Attempt distributed Redis sliding window
    try:
        client: Redis = Redis.from_url(
            settings.CELERY_BROKER_URL,
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
        )
        try:
            pipe = client.pipeline()
            cutoff = now - window_seconds
            # Remove timestamps older than window
            pipe.zremrangebyscore(key, 0, cutoff)
            # Count remaining in window
            pipe.zcard(key)
            # Add current timestamp
            pipe.zadd(key, {str(now): now})
            # Set key TTL
            pipe.expire(key, window_seconds + 5)
            _, current_count, _, _ = await pipe.execute()

            if current_count >= max_requests:
                return False, 0, window_seconds
            remaining = max(0, max_requests - (current_count + 1))
            return True, remaining, 0
        finally:
            await client.aclose()
    except (RedisError, Exception):
        # 2. Fallback to in-process sliding window
        window = _fallback_windows[key]
        cutoff = now - window_seconds
        while window and window[0] <= cutoff:
            window.popleft()
        if len(window) >= max_requests:
            return False, 0, window_seconds
        window.append(now)
        remaining = max(0, max_requests - len(window))
        return True, remaining, 0
