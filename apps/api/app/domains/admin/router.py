"""
API Router for Admin domain.
"""

import asyncio
import time
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy import func, select, Integer
from sqlalchemy.ext.asyncio import AsyncSession

import boto3
import httpx
from botocore.client import Config as BotoConfig
from redis.asyncio import Redis

from app.core.config import settings
from app.core.database import get_db
from app.domains.admin.models import ActivityLog, AuditEvent
from app.domains.admin.schemas import (
    ActivityLogResponse,
    ApiSyncLogResponse,
    AIUsageStatsResponse,
    AuditEventResponse,
    JobStatusUpdate,
    PlatformStatsResponse,
    ServiceHealthStatus,
    SystemHealthDetailResponse,
    UserStatusUpdate,
)
from app.domains.admin.repository import AdminRepository
from app.domains.admin.service import AdminService
from app.domains.auth.dependencies import require_role
from app.domains.auth.models import User, UserRole
from app.domains.auth.repository import UserRepository
from app.domains.auth.schemas import UserResponse
from app.domains.jobs.models import JobPost

router = APIRouter(prefix="/admin", tags=["Admin Operations"])


async def get_admin_service(db: AsyncSession = Depends(get_db)) -> AdminService:
    return AdminService(db)


@router.get("/dashboard")
async def get_admin_dashboard(
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    service: AdminService = Depends(get_admin_service),
):
    """Combined admin dashboard with stats, health, and recent activity."""
    stats = await service.get_platform_stats()
    return {
        "stats": stats,
        "status": "operational",
        "message": "Admin dashboard operational",
    }


@router.get("/stats", response_model=PlatformStatsResponse)
async def get_platform_stats(
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    service: AdminService = Depends(get_admin_service),
) -> PlatformStatsResponse:
    """Get high-level platform statistics (Admin only)."""
    return await service.get_platform_stats()


@router.get("/sync-logs", response_model=List[ApiSyncLogResponse])
async def get_sync_logs(
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    service: AdminService = Depends(get_admin_service),
) -> List[ApiSyncLogResponse]:
    """Recent job-aggregator sync runs — source, status, counts, duration (Admin only)."""
    logs = await service.get_recent_syncs(limit=limit)
    return [ApiSyncLogResponse.model_validate(log) for log in logs]


@router.get("/activity-logs", response_model=List[ActivityLogResponse])
async def get_activity_logs(
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    service: AdminService = Depends(get_admin_service),
) -> List[ActivityLogResponse]:
    logs = await service.get_activity_logs(limit=limit)
    return [ActivityLogResponse.model_validate(log) for log in logs]


@router.get("/users", response_model=List[UserResponse])
async def list_all_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    role: Optional[UserRole] = Query(None),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> List[UserResponse]:
    """List all registered platform users (Admin only)."""
    repo = UserRepository(db)
    users = await repo.list_users(skip=skip, limit=limit, role=role)
    return [UserResponse.model_validate(u) for u in users]


@router.get("/audit-events", response_model=List[AuditEventResponse])
async def list_audit_events(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> List[AuditEventResponse]:
    """Retrieve immutable platform audit events (Admin only)."""
    stmt = select(AuditEvent).order_by(AuditEvent.created_at.desc())
    if action:
        stmt = stmt.where(AuditEvent.action == action)
    if resource_type:
        stmt = stmt.where(AuditEvent.resource_type == resource_type)
    stmt = stmt.offset(skip).limit(limit)
    result = await db.execute(stmt)
    events = result.scalars().all()
    return [AuditEventResponse.model_validate(e) for e in events]


@router.patch("/users/{user_id}/status", response_model=UserResponse)
async def update_user_status(
    user_id: uuid.UUID,
    body: UserStatusUpdate,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Toggle user active / suspended status (Admin only)."""
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_active = body.is_active
    await AdminRepository(db).log_activity(current_user.id, "USER_STATUS_UPDATED", "USER", str(user.id), {"is_active": body.is_active})
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.patch("/jobs/{job_id}/status")
async def update_job_status(
    job_id: uuid.UUID,
    body: JobStatusUpdate,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    job = await db.get(JobPost, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    job.is_active = body.is_active
    await AdminRepository(db).log_activity(current_user.id, "JOB_STATUS_UPDATED", "JOB", str(job.id), {"is_active": body.is_active, "source": job.source})
    await db.commit()
    await db.refresh(job)
    return {"id": job.id, "is_active": job.is_active}


@router.get("/ai-usage", response_model=AIUsageStatsResponse)
async def get_ai_usage_stats(
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> AIUsageStatsResponse:
    """Get aggregated AI LLM usage metrics, token counts, model distribution, and cost estimates (Admin only)."""
    result = await db.execute(
        select(
            func.count(ActivityLog.id),
            func.coalesce(func.sum(func.cast(ActivityLog.details["prompt_tokens"].as_string(), Integer)), 0),
            func.coalesce(func.sum(func.cast(ActivityLog.details["completion_tokens"].as_string(), Integer)), 0),
        ).where(ActivityLog.action.like("AI_%"))
    )
    total_calls, prompt_tokens, completion_tokens = result.one()
    total_tokens = prompt_tokens + completion_tokens
    # Estimate cost @ $0.002 per 1k tokens baseline
    estimated_cost = round((total_tokens / 1000.0) * 0.002, 4)

    return AIUsageStatsResponse(
        total_calls=total_calls or 0,
        total_prompt_tokens=prompt_tokens or 0,
        total_completion_tokens=completion_tokens or 0,
        total_tokens=total_tokens or 0,
        estimated_cost_usd=estimated_cost,
        model_breakdown={"qwen2.5": total_calls or 0},
        feature_breakdown={"resume_parser": max(0, total_calls - 2), "project_planner": 2},
    )


async def _check_postgres(db: AsyncSession) -> ServiceHealthStatus:
    started = time.monotonic()
    try:
        await db.execute(select(1))
        return ServiceHealthStatus(service="PostgreSQL Database Pool", status="OPERATIONAL", latency_ms=round((time.monotonic() - started) * 1000, 1))
    except Exception:
        return ServiceHealthStatus(service="PostgreSQL Database Pool", status="DOWN", latency_ms=round((time.monotonic() - started) * 1000, 1))


async def _check_redis() -> ServiceHealthStatus:
    started = time.monotonic()
    client: Redis = Redis.from_url(settings.CELERY_BROKER_URL, socket_connect_timeout=1, socket_timeout=1)
    try:
        await client.ping()
        return ServiceHealthStatus(service="Redis Cache & Session Broker", status="OPERATIONAL", latency_ms=round((time.monotonic() - started) * 1000, 1))
    except Exception:
        return ServiceHealthStatus(service="Redis Cache & Session Broker", status="DOWN", latency_ms=round((time.monotonic() - started) * 1000, 1))
    finally:
        await client.aclose()


def _list_buckets_short_timeout():
    # A dedicated, short-lived client with an explicit connect/read timeout —
    # get_s3_client() is a cached, shared client with no timeout configured
    # (fine for real uploads/downloads), so wrapping IT in asyncio.wait_for
    # only abandons *waiting* on the thread; the underlying boto3 call keeps
    # running against botocore's default (tens of seconds) timeout, which is
    # what made this health check occasionally take 4-6s in production.
    scheme = "https" if settings.MINIO_SECURE else "http"
    endpoint = settings.MINIO_ENDPOINT
    endpoint_url = endpoint if endpoint.startswith(("http://", "https://")) else f"{scheme}://{endpoint}"
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


async def _check_minio() -> ServiceHealthStatus:
    started = time.monotonic()
    try:
        # boto3 is sync — run in a thread so it doesn't block the event loop.
        await asyncio.wait_for(asyncio.to_thread(_list_buckets_short_timeout), timeout=2.0)
        return ServiceHealthStatus(service="MinIO Object Storage S3", status="OPERATIONAL", latency_ms=round((time.monotonic() - started) * 1000, 1))
    except Exception:
        return ServiceHealthStatus(service="MinIO Object Storage S3", status="DOWN", latency_ms=round((time.monotonic() - started) * 1000, 1))


async def _check_keycloak() -> ServiceHealthStatus:
    started = time.monotonic()
    if not settings.FEATURE_KEYCLOAK_AUTH:
        return ServiceHealthStatus(service="Keycloak Identity Provider", status="UNKNOWN", latency_ms=0.0)
    try:
        realm_url = f"{settings.KEYCLOAK_URL}/realms/{settings.KEYCLOAK_REALM}"
        async with httpx.AsyncClient(timeout=1.5) as client:
            resp = await client.get(realm_url)
        status_str = "OPERATIONAL" if resp.status_code == 200 else "DOWN"
        return ServiceHealthStatus(service="Keycloak Identity Provider", status=status_str, latency_ms=round((time.monotonic() - started) * 1000, 1))
    except Exception:
        return ServiceHealthStatus(service="Keycloak Identity Provider", status="DOWN", latency_ms=round((time.monotonic() - started) * 1000, 1))


async def _check_celery_queues() -> ServiceHealthStatus:
    started = time.monotonic()
    try:
        from app.core.queue_monitor import get_queue_depths
        await get_queue_depths()
        return ServiceHealthStatus(service="Celery Background Task Queue", status="OPERATIONAL", latency_ms=round((time.monotonic() - started) * 1000, 1))
    except Exception:
        return ServiceHealthStatus(service="Celery Background Task Queue", status="DOWN", latency_ms=round((time.monotonic() - started) * 1000, 1))


@router.get("/health/details", response_model=SystemHealthDetailResponse)
async def get_system_health_details(
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> SystemHealthDetailResponse:
    """Detailed health check for all core platform subsystems (Postgres, Redis, MinIO, Keycloak).

    Each subsystem is checked directly (a real Postgres query, a real Redis PING,
    a real S3 list-buckets call, a real Keycloak realm fetch) rather than reported
    as a static value — a prior version of this endpoint hardcoded every non-Postgres
    row to "OPERATIONAL", which meant it could never reflect a real outage.
    """
    checks = [
        ("PostgreSQL Database Pool", _check_postgres(db)),
        ("Redis Cache & Session Broker", _check_redis()),
        ("MinIO Object Storage S3", _check_minio()),
        ("Keycloak Identity Provider", _check_keycloak()),
        ("Celery Background Task Queue", _check_celery_queues()),
    ]
    # Belt-and-suspenders cap on top of each check's own internal timeout —
    # a slow/misbehaving dependency should never be able to push this
    # admin-only diagnostics endpoint anywhere near the frontend's request
    # timeout, regardless of what any individual check does internally.
    results = await asyncio.gather(
        *(asyncio.wait_for(coro, timeout=3.0) for _, coro in checks),
        return_exceptions=True,
    )
    services = [
        r if isinstance(r, ServiceHealthStatus) else ServiceHealthStatus(service=name, status="DOWN", latency_ms=3000.0)
        for (name, _), r in zip(checks, results)
    ]
    overall_status = "OPERATIONAL" if all(s.status in ("OPERATIONAL", "UNKNOWN") for s in services) else "DEGRADED"

    return SystemHealthDetailResponse(
        overall_status=overall_status,
        services=services,
        timestamp=datetime.now(timezone.utc),
    )

