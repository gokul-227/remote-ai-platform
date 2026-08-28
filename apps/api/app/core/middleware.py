"""
Custom FastAPI Middleware
"""

import time
import uuid
from collections import defaultdict, deque
from typing import Callable

import structlog
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
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

        client_ip = (
            request.headers.get("cf-connecting-ip")
            or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or (request.client.host if request.client else "unknown")
        )
        user_agent = request.headers.get("user-agent", "")
        identifier = f"{client_ip}_{hash(user_agent) % 100000}"

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
