"""
Enterprise Health & Diagnostic Subsystem — Remote AI Platform.

Provides distinct liveness, readiness, and dependency diagnostics endpoints:
- /health/live: Process liveness (fast, non-blocking 200 OK if FastAPI event loop is running)
- /health/ready: Readiness probe checking PostgreSQL and Redis broker connectivity
- /health/dependencies: Deep inspection of all backing services (DB, Redis, S3/MinIO, LiteLLM, Job Aggregators)
- /health: Backward-compatible alias for readiness check
"""

import asyncio
import time
from datetime import UTC, datetime
from typing import Any

import boto3
import httpx
from botocore.client import Config as BotoConfig
from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.queue_monitor import get_queue_depths

router = APIRouter(tags=["Health & Operations"])


class ServiceCheckResult(BaseModel):
    service: str
    status: str  # HEALTHY, DEGRADED, DOWN, UNKNOWN
    latency_ms: float
    checked_at: str
    details: dict[str, Any] | None = None
    error: str | None = None


class HealthLiveResponse(BaseModel):
    status: str = "HEALTHY"
    version: str
    environment: str
    timestamp: str


class HealthReadyResponse(BaseModel):
    status: str  # HEALTHY, DEGRADED, DOWN
    version: str
    environment: str
    timestamp: str
    services: dict[str, ServiceCheckResult]


# ── Dependency Check Helpers ──────────────────────────────────────────────────


async def _check_database(db: AsyncSession) -> ServiceCheckResult:
    started = time.perf_counter()
    checked_at = datetime.now(UTC).isoformat()
    try:
        await db.execute(text("SELECT 1"))
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        return ServiceCheckResult(
            service="PostgreSQL Database Pool",
            status="HEALTHY",
            latency_ms=latency_ms,
            checked_at=checked_at,
        )
    except Exception as exc:
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        return ServiceCheckResult(
            service="PostgreSQL Database Pool",
            status="DOWN",
            latency_ms=latency_ms,
            checked_at=checked_at,
            error=str(exc)[:120],
        )


async def _check_redis() -> ServiceCheckResult:
    started = time.perf_counter()
    checked_at = datetime.now(UTC).isoformat()
    client: Redis | None = None
    try:
        client = Redis.from_url(
            settings.CELERY_BROKER_URL,
            socket_connect_timeout=1.5,
            socket_timeout=1.5,
        )
        if client is not None:
            await client.ping()
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        return ServiceCheckResult(
            service="Redis Broker & Cache",
            status="HEALTHY",
            latency_ms=latency_ms,
            checked_at=checked_at,
        )
    except Exception as exc:
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        return ServiceCheckResult(
            service="Redis Broker & Cache",
            status="DOWN",
            latency_ms=latency_ms,
            checked_at=checked_at,
            error=str(exc)[:120],
        )
    finally:
        if client:
            await client.aclose()


def _probe_s3_storage_sync() -> None:
    scheme = "https" if settings.MINIO_SECURE else "http"
    endpoint = settings.MINIO_ENDPOINT
    endpoint_url = (
        endpoint if endpoint.startswith(("http://", "https://")) else f"{scheme}://{endpoint}"
    )
    client = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=settings.MINIO_ACCESS_KEY,
        aws_secret_access_key=settings.MINIO_SECRET_KEY,
        config=BotoConfig(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            connect_timeout=1.5,
            read_timeout=1.5,
            retries={"max_attempts": 0},
        ),
    )
    client.list_buckets()


async def _check_storage() -> ServiceCheckResult:
    started = time.perf_counter()
    checked_at = datetime.now(UTC).isoformat()
    try:
        await asyncio.wait_for(asyncio.to_thread(_probe_s3_storage_sync), timeout=2.0)
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        return ServiceCheckResult(
            service="Object Storage (S3/MinIO)",
            status="HEALTHY",
            latency_ms=latency_ms,
            checked_at=checked_at,
        )
    except Exception as exc:
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        return ServiceCheckResult(
            service="Object Storage (S3/MinIO)",
            status="DOWN",
            latency_ms=latency_ms,
            checked_at=checked_at,
            error=str(exc)[:120],
        )


async def _check_ai_provider() -> ServiceCheckResult:
    started = time.perf_counter()
    checked_at = datetime.now(UTC).isoformat()
    provider = settings.AI_PROVIDER.lower()
    if provider == "ollama":
        url = f"{settings.OLLAMA_BASE_URL}/api/tags"
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get(url)
            status_val = "HEALTHY" if resp.status_code == 200 else "DEGRADED"
            latency_ms = round((time.perf_counter() - started) * 1000, 2)
            return ServiceCheckResult(
                service=f"AI Provider ({provider})",
                status=status_val,
                latency_ms=latency_ms,
                checked_at=checked_at,
            )
        except Exception as exc:
            latency_ms = round((time.perf_counter() - started) * 1000, 2)
            return ServiceCheckResult(
                service=f"AI Provider ({provider})",
                status="DOWN",
                latency_ms=latency_ms,
                checked_at=checked_at,
                error=str(exc)[:120],
            )
    else:
        # For cloud providers (Groq/OpenAI), verify API key presence
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        has_key = bool(settings.AI_API_KEY or settings.GROQ_API_KEY or settings.OPENAI_API_KEY)
        return ServiceCheckResult(
            service=f"AI Provider ({provider})",
            status="HEALTHY" if has_key else "DEGRADED",
            latency_ms=latency_ms,
            checked_at=checked_at,
            details={"configured": has_key},
            error=None if has_key else "No API key configured for cloud AI provider",
        )


# ── Health Route Definitions ──────────────────────────────────────────────────


@router.get("/health/live", response_model=HealthLiveResponse, summary="Process liveness check")
async def health_liveness() -> HealthLiveResponse:
    """Fast non-blocking liveness probe to verify FastAPI process event loop is active."""
    return HealthLiveResponse(
        status="HEALTHY",
        version=settings.APP_VERSION,
        environment=settings.APP_ENV,
        timestamp=datetime.now(UTC).isoformat(),
    )


@router.get("/health/ready", response_model=HealthReadyResponse, summary="Service readiness check")
async def health_readiness(
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> HealthReadyResponse:
    """Readiness probe checking core database and broker connectivity."""
    db_result, redis_result = await asyncio.gather(
        _check_database(db),
        _check_redis(),
        return_exceptions=False,
    )

    services = {
        "database": db_result,
        "redis": redis_result,
    }

    if db_result.status == "DOWN":
        overall = "DOWN"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    elif redis_result.status == "DOWN":
        overall = "DEGRADED"
        response.status_code = status.HTTP_200_OK
    else:
        overall = "HEALTHY"
        response.status_code = status.HTTP_200_OK

    return HealthReadyResponse(
        status=overall,
        version=settings.APP_VERSION,
        environment=settings.APP_ENV,
        timestamp=datetime.now(UTC).isoformat(),
        services=services,
    )


@router.get(
    "/health/dependencies",
    response_model=HealthReadyResponse,
    summary="Deep dependencies diagnostic",
)
async def health_dependencies(
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> HealthReadyResponse:
    """Deep dependency inspection checking DB, Redis, S3 Storage, and AI provider."""
    db_result, redis_result, storage_result, ai_result = await asyncio.gather(
        _check_database(db),
        _check_redis(),
        _check_storage(),
        _check_ai_provider(),
        return_exceptions=False,
    )

    services = {
        "database": db_result,
        "redis": redis_result,
        "storage": storage_result,
        "ai_provider": ai_result,
    }

    if db_result.status == "DOWN":
        overall = "DOWN"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    elif any(s.status == "DOWN" for s in services.values()):
        overall = "DEGRADED"
        response.status_code = status.HTTP_200_OK
    else:
        overall = "HEALTHY"
        response.status_code = status.HTTP_200_OK

    return HealthReadyResponse(
        status=overall,
        version=settings.APP_VERSION,
        environment=settings.APP_ENV,
        timestamp=datetime.now(UTC).isoformat(),
        services=services,
    )


@router.get("/health", summary="Standard health check (Readiness alias)")
async def health_check_legacy(
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Legacy health check endpoint returning format expected by Docker and monitoring."""
    ready_resp = await health_readiness(response, db)
    return {
        "status": "ok" if ready_resp.status in ("HEALTHY", "DEGRADED") else "down",
        "version": ready_resp.version,
        "environment": ready_resp.environment,
        "services": {
            k: v.status.lower()
            if v.status == "HEALTHY"
            else f"{v.status.lower()}: {v.error or ''}".strip()
            for k, v in ready_resp.services.items()
        },
    }


@router.get("/health/queues", summary="Queue depths overview")
async def queue_health():
    """Return current approximate Celery queue depths for operational checks."""
    try:
        depths = await get_queue_depths()
        return {"status": "HEALTHY", "queues": depths}
    except Exception as exc:
        return {"status": "DEGRADED", "queues": {}, "error": str(exc)[:100]}
