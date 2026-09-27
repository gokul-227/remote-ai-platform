"""
Distributed Redis-Backed Rate Limiting with In-Memory Fallback.
Provides tiered rate limits across Authentication, AI, and Public endpoints.
"""

import time
import uuid
from collections import deque

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import settings

# Route tiers: (limit_requests, window_seconds)
TIER_AUTH = (10, 60)
TIER_AI = (30, 60)
TIER_GENERAL = (120, 60)

# Path prefixes whose *every* request triggers a real per-call LLM completion
# (real $ cost), so they must never share the loose default/general tier with
# routine CRUD/read endpoints. "/quality" (unprefixed) is kept for backward
# compatibility with any client hitting the router without the versioned prefix.
AI_CALL_ROUTE_PREFIXES = (
    "/api/v1/quality",
    "/quality",
    "/api/v1/matching",
    "/api/v1/engineers/me/resume",
    "/api/v1/engineers/me/ai-enhance",
)

# projects/* AI endpoints have a variable {project_id}/{submission_id} segment
# in the middle of the path, so they're matched by suffix (+ POST) rather than
# prefix -- generate_project_plan, generate_progress_summary,
# generate_risk_analysis, generate_documentation and ai_review_submission in
# app/domains/projects/router.py, all of which call AIService()/an AI agent.
# (This also covers /api/v1/projects/submissions/{id}/ai-review via the
# "/ai-review" suffix, so that path doesn't need its own separate check.)
AI_CALL_ROUTE_SUFFIXES = (
    "/plan",
    "/ai/progress-summary",
    "/ai/risk-analysis",
    "/ai/documentation",
    "/ai-review",
)

# General (CRUD/read) budget, as a multiple of RATE_LIMIT_MAX_REQUESTS. Budgets are
# per client *and endpoint class* (not per path, see route_class), so this covers
# all of a client's ordinary requests in the window, including UI polling.
GENERAL_MULTIPLIER = 30

# In-memory fallback state (used only while Redis is unreachable). Bounded, so a
# flood of distinct clients cannot grow process memory without limit.
FALLBACK_MAX_KEYS = 10_000
_fallback_windows: dict[str, deque[float]] = {}

_redis: Redis | None = None


def reset_fallback_state() -> None:
    """Clear in-memory rate-limit counters. Call between tests to prevent state bleed."""
    global _redis
    _fallback_windows.clear()
    _redis = None


def _get_redis() -> Redis:
    """One pooled client per process instead of a new connection per request."""
    global _redis
    if _redis is None:
        _redis = Redis.from_url(
            settings.redis_url,
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
        )
    return _redis


def route_class(path: str, method: str = "GET") -> str | None:
    """The budget a request counts against, or None when it is exempt.

    Keying buckets by class rather than raw path means varying an id or adding
    junk to the path cannot mint a fresh budget.
    """
    return _classify(path, method.upper())[0]


def get_route_tier(path: str, method: str = "GET") -> tuple[int, int] | None:
    """(limit, window_seconds) for the request's class, or None when exempt."""
    return _classify(path, method.upper())[1]


def _classify(path: str, method: str) -> tuple[str | None, tuple[int, int] | None]:
    # Exempt internal/diagnostic routes
    if path in {
        "/health",
        "/health/live",
        "/health/ready",
        "/health/dependencies",
        "/api/v1/health",
        "/metrics",
        "/docs",
        "/redoc",
        "/openapi.json",
    }:
        return None, None

    base_limit = settings.RATE_LIMIT_MAX_REQUESTS
    window = settings.RATE_LIMIT_WINDOW_SECONDS

    # Sign-in itself happens at Supabase; account deletion and data export
    # are the sensitive self-service actions here.
    if path in {"/api/v1/auth/me/export"} or (method == "DELETE" and path == "/api/v1/auth/me"):
        return "sensitive", (base_limit, window)

    if any(path.startswith(p) for p in AI_CALL_ROUTE_PREFIXES):
        return "ai", (base_limit * 3, window)

    if method == "POST" and path.startswith("/api/v1/projects/") and path.endswith(
        AI_CALL_ROUTE_SUFFIXES
    ):
        return "ai", (base_limit * 3, window)

    # Job creation synchronously triggers JobEnricherAgent (an LLM call); job reads (GET/list)
    # don't and should stay on the general tier -- hence the method check rather than a bare
    # prefix match, which would otherwise also throttle routine job browsing.
    if method == "POST" and path == "/api/v1/jobs":
        return "ai", (base_limit * 3, window)

    # Unauthenticated-callable ingestion endpoint (visitor funnel events) —
    # tighter than the general-purpose default so it can't be used to
    # flood the DB, but looser than the auth tier since normal page usage
    # can legitimately fire several events per session.
    if path.startswith("/api/v1/analytics/events"):
        return "ingest", (base_limit * 5, window)

    return "general", (base_limit * GENERAL_MULTIPLIER, window)


async def check_rate_limit(
    identifier: str,
    path: str,
    method: str = "GET",
) -> tuple[bool, int, int]:
    """
    Check rate limit for client identifier on path.
    Returns: (is_allowed, remaining_requests, retry_after_seconds)
    """
    bucket, tier = _classify(path, method.upper())
    if bucket is None or tier is None:
        return True, 9999, 0

    max_requests, window_seconds = tier
    now = time.time()
    key = settings.redis_key(f"ratelimit:{bucket}:{identifier}")

    # 1. Distributed Redis sliding window
    try:
        pipe = _get_redis().pipeline()
        cutoff = now - window_seconds
        pipe.zremrangebyscore(key, 0, cutoff)
        pipe.zcard(key)
        # Unique member: two requests in the same clock tick must both count.
        pipe.zadd(key, {f"{now}:{uuid.uuid4().hex[:8]}": now})
        pipe.expire(key, window_seconds + 5)
        _, current_count, _, _ = await pipe.execute()

        if current_count >= max_requests:
            return False, 0, window_seconds
        remaining = max(0, max_requests - (current_count + 1))
        return True, remaining, 0
    except (RedisError, Exception):
        # Recreate the client next time (it may be bound to a dead connection or loop).
        global _redis
        _redis = None
        return _check_fallback(key, now, max_requests, window_seconds)


def _check_fallback(
    key: str, now: float, max_requests: int, window_seconds: int
) -> tuple[bool, int, int]:
    """In-process sliding window, used only while Redis is unreachable."""
    window = _fallback_windows.get(key)
    if window is None:
        if len(_fallback_windows) >= FALLBACK_MAX_KEYS:
            _evict_fallback(now, window_seconds)
        window = _fallback_windows[key] = deque()
    cutoff = now - window_seconds
    while window and window[0] <= cutoff:
        window.popleft()
    if len(window) >= max_requests:
        return False, 0, window_seconds
    window.append(now)
    remaining = max(0, max_requests - len(window))
    return True, remaining, 0


def _evict_fallback(now: float, window_seconds: int) -> None:
    """Drop idle clients first; if still full, drop the oldest-inserted half."""
    cutoff = now - window_seconds
    for k in [k for k, w in _fallback_windows.items() if not w or w[-1] <= cutoff]:
        del _fallback_windows[k]
    if len(_fallback_windows) >= FALLBACK_MAX_KEYS:
        for k in list(_fallback_windows)[: max(1, FALLBACK_MAX_KEYS // 2)]:
            del _fallback_windows[k]
