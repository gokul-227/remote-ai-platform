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
            method=request.method,
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


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Baseline security headers on every API response.

    This is a JSON API, not an HTML site, but /docs and /redoc (dev-only,
    see create_app()) do render HTML, and any client -- including one that
    doesn't correctly validate Content-Type -- benefits from these being
    unconditional rather than conditioned on which route responded. CSP is
    deliberately NOT set here: FastAPI's default Swagger UI at /docs loads its
    JS/CSS from a CDN, and a CSP restrictive enough to matter would break that
    dev-only page for zero production benefit (it's disabled in production --
    see create_app()). The frontend (apps/web/next.config.ts) is the one
    surface actually rendering arbitrary HTML and already sets a real CSP.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
        )
        # Browsers ignore HSTS on a plain-http response (local dev, Render's
        # internal health checks), so this is safe to send unconditionally --
        # it only takes effect once a browser actually loads the API over
        # https, which is exactly when it should.
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
        )
        return response
