"""
Custom FastAPI Middleware
"""

import time
import uuid
from collections.abc import Callable

import structlog
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.metrics import HTTP_REQUESTS

logger = structlog.get_logger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Injects a unique X-Request-ID header into every request and response.
    Binds the request ID to the structlog context for consistent log correlation.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        )

        start_time = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = str(duration_ms)

        logger.info(
            "Request completed",
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        HTTP_REQUESTS.labels(request.method, request.url.path, str(response.status_code)).inc()

        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Tiered distributed sliding-window rate limiter with in-memory fallback.
    Protects Authentication, AI Services, and General API routes.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        from app.core.rate_limiter import check_rate_limit

        # This API isn't sat behind Cloudflare (only the frontend Worker is),
        # so cf-connecting-ip would be a client-supplied, unverified header
        # here -- trusting it (or a client-suppliable User-Agent, previously
        # folded into this identifier) let an attacker reset their own rate
        # limit bucket on every request. x-forwarded-for's first entry is the
        # client-supplied one too, but Render's own edge appends the real
        # peer IP as the *last* hop, which a client can't forge.
        forwarded_for = request.headers.get("x-forwarded-for", "")
        client_ip = (
            forwarded_for.split(",")[-1].strip()
            if forwarded_for
            else (request.client.host if request.client else "unknown")
        )
        identifier = client_ip

        is_allowed, remaining, retry_after = await check_rate_limit(
            identifier=identifier,
            path=request.url.path,
        )

        if not is_allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down and try again later."},
                headers={"Retry-After": str(retry_after or 60)},
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response
