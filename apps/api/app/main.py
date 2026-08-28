"""
Remote AI Platform — FastAPI Application Factory
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.core.config import settings
from app.core.database import engine, Base
from app.core.logging import configure_logging
from app.core.middleware import RequestIDMiddleware, RateLimitMiddleware

from app.core.health import router as health_router
from app.core.exceptions import register_exception_handlers

# Domain routers — imported as they are implemented
from app.domains.auth.router import router as auth_router
from app.domains.engineers.router import router as engineers_router
from app.domains.companies.router import router as companies_router
from app.domains.jobs.router import router as jobs_router
from app.domains.search.router import router as search_router
from app.domains.matching.router import router as matching_router
from app.domains.admin.router import router as admin_router
from app.domains.admin.moderation_router import router as moderation_router
from app.domains.saved_jobs.router import router as saved_jobs_router
from app.domains.applications.router import router as applications_router
from app.domains.projects.router import router as projects_router
from app.domains.notifications.router import router as notifications_router
from app.domains.network.router import router as network_router
from app.domains.social.router import router as social_router
from app.domains.contracts.router import router as contracts_router
from app.domains.trust.router import router as trust_router
from app.domains.payments.router import router as payments_router
from app.domains.groups.router import router as groups_router
from app.domains.quality.router import router as quality_router

logger = structlog.get_logger(__name__)


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
            await conn.run_sync(lambda c: c.execute(
                __import__("sqlalchemy").text("SELECT 1")
            ))
        logger.info("Database connection verified")
    except Exception as e:
        logger.error("Database connection failed", error=str(e))
        raise

    # Auto-run alembic migrations on startup (safe: idempotent)
    try:
        import subprocess, sys as _sys
        result = subprocess.run(
            [_sys.executable, "-m", "alembic", "upgrade", "head"],
            capture_output=True, text=True, timeout=120,
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
    app = FastAPI(
        title="Remote AI Platform",
        description=(
            "AI-powered Remote Engineering Marketplace — "
            "Aggregate remote jobs, match engineers with AI, and connect talent with companies."
        ),
        version=settings.APP_VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
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

    return app


app = create_app()
