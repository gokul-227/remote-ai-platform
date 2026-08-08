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
    Small in-process sliding-window limiter for sensitive endpoints.
    A shared Redis limiter remains the production-scale follow-up.
    """

    def __init__(self, app):
        super().__init__(app)
        self._requests: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        protected_paths = {"/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/engineers/me/resume"}
        if request.url.path in protected_paths:
            now = time.monotonic()
            client_host = request.client.host if request.client else "unknown"
            key = f"{client_host}:{request.url.path}"
            window = self._requests[key]
            cutoff = now - settings.RATE_LIMIT_WINDOW_SECONDS
            while window and window[0] <= cutoff:
                window.popleft()
            if len(window) >= settings.RATE_LIMIT_MAX_REQUESTS:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests. Please try again later."},
                    headers={"Retry-After": str(settings.RATE_LIMIT_WINDOW_SECONDS)},
                )
            window.append(now)
        return await call_next(request)
