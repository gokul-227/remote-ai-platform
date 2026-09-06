"""
Remote AI Platform — FastAPI Application Factory
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import sentry_sdk
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.types import Event, Hint

from app.core.config import settings
from app.core.database import engine
from app.core.exceptions import register_exception_handlers
from app.core.health import router as health_router
from app.core.logging import configure_logging
from app.core.middleware import RateLimitMiddleware, RequestIDMiddleware, SecurityHeadersMiddleware
from app.domains.admin.moderation_router import router as moderation_router
from app.domains.admin.router import router as admin_router
from app.domains.analytics.router import router as analytics_router
from app.domains.applications.router import router as applications_router

# Domain routers — imported as they are implemented
from app.domains.auth.router import router as auth_router
from app.domains.companies.router import router as companies_router
from app.domains.contracts.router import router as contracts_router
from app.domains.engineers.router import router as engineers_router
from app.domains.groups.router import router as groups_router
from app.domains.jobs.router import router as jobs_router
from app.domains.matching.router import router as matching_router
from app.domains.network.router import router as network_router
from app.domains.notifications.router import router as notifications_router
from app.domains.payments.router import router as payments_router
from app.domains.projects.router import router as projects_router
from app.domains.quality.router import router as quality_router
from app.domains.saved_jobs.router import router as saved_jobs_router
from app.domains.search.router import router as search_router
from app.domains.social.router import router as social_router
from app.domains.trust.router import router as trust_router

logger = structlog.get_logger(__name__)


def _sentry_before_send(event: Event, hint: Hint) -> Event | None:
    """Best-effort scrub of common sensitive fields before an event is sent.

    IMPORTANT: `send_default_pii=False` (set in init_sentry below) does NOT
    stop request bodies from being attached to events -- that gate only
    covers things like the client IP and cookies (via
    RequestExtractor.extract_into_event in the SDK's WSGI/ASGI integrations,
    `attach_request_body` defaults to True independent of send_default_pii).
    So a JSON body posted to e.g. /auth/login, /auth/register, or
    /auth/reset-password *is* captured under event["request"]["data"] when an
    unhandled exception occurs during that request, up to
    `max_request_body_size` -- this scrub is not defense-in-depth, it is the
    only thing standing between "user submits a password" and "that password
    sits in Sentry in cleartext." Matching is substring-based (not exact-key)
    so field-name variants -- new_password, current_password, reset_token,
    password_hash, stripe_secret_key, client_secret, etc. -- are all caught
    without having to enumerate every schema field by name.
    """
    sensitive_key_substrings = (
        "authorization",
        "cookie",
        "password",
        "token",
        "secret",
        "api_key",
        "apikey",
    )

    def _is_sensitive_key(key: str) -> bool:
        lowered = key.lower()
        return any(marker in lowered for marker in sensitive_key_substrings)

    def _scrub(value: object) -> object:
        if isinstance(value, dict):
            return {
                k: ("[Filtered]" if _is_sensitive_key(k) else _scrub(v))
                for k, v in value.items()
            }
        if isinstance(value, list):
            return [_scrub(v) for v in value]
        return value

    request = event.get("request")
    if isinstance(request, dict):
        for field in ("headers", "data"):
            if field in request:
                request[field] = _scrub(request[field])
        # Cookie *values* are inherently sensitive (session IDs, CSRF
        # tokens, ...) regardless of what the cookie happens to be named --
        # unlike headers/data, name-based key matching isn't the right
        # check here, so redact every cookie value outright. Belt-and-braces
        # alongside send_default_pii=False, which already keeps cookies out
        # of the event in the current SDK.
        if "cookies" in request and isinstance(request["cookies"], dict):
            request["cookies"] = dict.fromkeys(request["cookies"], "[Filtered]")

    return event


def init_sentry() -> None:
    """Initialize Sentry error monitoring, or do nothing at all.

    No-op by design when SENTRY_DSN is unset/empty: no network calls, no log
    lines, no warnings. This lets the SDK ship in every environment (including
    ones without a Sentry project yet) with zero behavioral change until a
    real DSN is configured.
    """
    if not settings.SENTRY_DSN:
        return

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.APP_ENV,
        release=settings.GIT_SHA,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        # Off by default in recent SDK versions; set explicitly so this stays
        # true even if the SDK's own default ever changes. PII (request IP,
        # cookies) must never be sent to Sentry.
        send_default_pii=False,
        # Defaults to True in the SDK: it captures a snapshot of every local
        # variable in every frame of a captured exception's stack trace.
        # send_default_pii=False does NOT gate this -- it's a fully separate
        # option -- so without this explicit override, an unhandled exception
        # raised while a plaintext password, JWT, or resume text is sitting
        # in a local variable (e.g. inside AuthService.verify_token or
        # EngineerService.upload_resume) would ship that value to Sentry in
        # cleartext, bypassing _sentry_before_send entirely (it only scrubs
        # event["request"], never event["exception"]["values"][*]["stacktrace"]).
        include_local_variables=False,
        before_send=_sentry_before_send,
        integrations=[StarletteIntegration(), FastApiIntegration()],
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan — runs startup and shutdown logic."""
    settings.validate_production_settings()
    configure_logging()
    logger.info(
        "Remote AI Platform starting",
        version=settings.APP_VERSION,
        environment=settings.APP_ENV,
    )

    # Startup: verify DB connectivity, run migrations, seed data
    try:
        async with engine.begin() as conn:
            await conn.run_sync(lambda c: c.execute(__import__("sqlalchemy").text("SELECT 1")))
        logger.info("Database connection verified")
    except Exception as e:
        logger.error("Database connection failed", error=str(e))
        raise

    # Auto-run alembic migrations on startup (safe: idempotent)
    try:
        import subprocess
        import sys as _sys

        result = subprocess.run(
            [_sys.executable, "-m", "alembic", "upgrade", "head"],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode == 0:
            logger.info("Alembic migrations applied", output=result.stdout.strip().split("\n")[-1])
        else:
            logger.warning("Alembic migration warning", stderr=result.stderr.strip())
    except Exception as e:
        logger.warning("Alembic migration skipped", error=str(e))

    # Auto-seed demo data only in development or if explicitly requested via configuration
    if settings.is_development or settings.SEED_DEMO_DATA:
        try:
            from app.scripts.seed_data import seed_demo_data

            await seed_demo_data()
        except Exception as e:
            logger.warning("Seed data skipped", error=str(e))

    yield

    # Shutdown
    await engine.dispose()
    logger.info("Remote AI Platform shutdown complete")


def create_app() -> FastAPI:
    init_sentry()

    # /docs, /redoc and /openapi.json map the entire API surface (every route,
    # request/response schema, auth requirements) for whoever requests them --
    # a fine dev convenience, but in production it's a free recon tool for
    # attackers and was previously enabled unconditionally regardless of
    # environment. Gate them on the same is_production check already used
    # elsewhere (validate_production_settings, seed-data auto-run) so a single
    # Render env var (or the RENDER=true fallback) can't leave this mismatched.
    docs_enabled = not settings.is_production
    app = FastAPI(
        title="Remote AI Platform",
        description=(
            "AI-powered Remote Engineering Marketplace — "
            "Aggregate remote jobs, match engineers with AI, and connect talent with companies."
        ),
        version=settings.APP_VERSION,
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
        lifespan=lifespan,
    )

    # ── Middleware ─────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestIDMiddleware)

    # ── Exception handlers ────────────────────────────────────────────────────
    register_exception_handlers(app)

    # ── Prometheus metrics ─────────────────────────────────────────────────────
    Instrumentator(
        should_group_status_codes=False,
        should_ignore_untemplated=True,
        should_respect_env_var=True,
        should_instrument_requests_inprogress=True,
        excluded_handlers=["/metrics", "/api/v1/health", "/health/live", "/health/ready"],
        inprogress_name="remote_ai_platform_inprogress_requests",
        inprogress_labels=True,
    ).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

    # ── Root & API Routers ─────────────────────────────────────────────────────
    # Register health router at root for standard cloud load balancers (/health/live, /health/ready)
    app.include_router(health_router)

    prefix = "/api/v1"
    app.include_router(health_router, prefix=prefix)
    app.include_router(auth_router, prefix=prefix)
    app.include_router(engineers_router, prefix=prefix)
    app.include_router(companies_router, prefix=prefix)
    app.include_router(jobs_router, prefix=prefix)
    app.include_router(search_router, prefix=prefix)
    app.include_router(matching_router, prefix=prefix)
    app.include_router(admin_router, prefix=prefix)
    app.include_router(moderation_router, prefix=prefix)
    app.include_router(saved_jobs_router, prefix=prefix)
    app.include_router(applications_router, prefix=prefix)
    app.include_router(projects_router, prefix=prefix)
    app.include_router(notifications_router, prefix=prefix)
    app.include_router(network_router, prefix=prefix)
    app.include_router(social_router, prefix=prefix)
    app.include_router(contracts_router, prefix=prefix)
    app.include_router(trust_router, prefix=prefix)
    app.include_router(payments_router, prefix=prefix)
    app.include_router(groups_router, prefix=prefix)
    app.include_router(quality_router, prefix=prefix)
    app.include_router(analytics_router, prefix=prefix)

    return app


app = create_app()
