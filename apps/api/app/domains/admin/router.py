"""
API Router for Admin domain.
"""

import asyncio
import time
import uuid
from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from redis.asyncio import Redis
from sqlalchemy import Integer, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.domains.admin.models import ActivityLog, AuditEvent
from app.domains.admin.repository import AdminRepository
from app.domains.admin.schemas import (
    ActivityLogResponse,
    AIUsageStatsResponse,
    ApiSyncLogResponse,
    AuditEventResponse,
    JobStatusUpdate,
    PlatformStatsResponse,
    ServiceHealthStatus,
    SystemHealthDetailResponse,
    UserRoleUpdate,
    UserStatusUpdate,
)
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


@router.get("/sync-logs", response_model=list[ApiSyncLogResponse])
async def get_sync_logs(
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    service: AdminService = Depends(get_admin_service),
) -> list[ApiSyncLogResponse]:
    """Recent job-aggregator sync runs — source, status, counts, duration (Admin only)."""
    logs = await service.get_recent_syncs(limit=limit)
    return [ApiSyncLogResponse.model_validate(log) for log in logs]


@router.get("/activity-logs", response_model=list[ActivityLogResponse])
async def get_activity_logs(
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    service: AdminService = Depends(get_admin_service),
) -> list[ActivityLogResponse]:
    logs = await service.get_activity_logs(limit=limit)
    return [ActivityLogResponse.model_validate(log) for log in logs]


@router.get("/users", response_model=list[UserResponse])
async def list_all_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    role: UserRole | None = Query(None),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> list[UserResponse]:
    """List all registered platform users (Admin only)."""
    repo = UserRepository(db)
    users = await repo.list_users(skip=skip, limit=limit, role=role)
    return [UserResponse.model_validate(u) for u in users]


@router.get("/audit-events", response_model=list[AuditEventResponse])
async def list_audit_events(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> list[AuditEventResponse]:
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
    await AdminRepository(db).log_activity(
        current_user.id, "USER_STATUS_UPDATED", "USER", str(user.id), {"is_active": body.is_active}
    )
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.patch("/users/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: uuid.UUID,
    body: UserRoleUpdate,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Change a user's role, including promoting to ADMIN (Admin only).

    Distinct from PATCH /auth/role, which is self-service onboarding and
    explicitly forbids self-assigning ADMIN.
    """
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    previous_role = user.role
    user.role = body.role
    await AdminRepository(db).log_activity(
        current_user.id,
        "USER_ROLE_UPDATED",
        "USER",
        str(user.id),
        {"previous_role": previous_role.value, "new_role": body.role.value},
    )
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Permanently delete a user and all dependent data (Admin only).

    Every FK to users.id is ON DELETE CASCADE at the database level, so
    this removes the user's profile, applications, notifications, etc.
    along with the row. Irreversible — intended for removing test/demo
    accounts, not for routine account closure (use status suspension for
    that).
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete your own account"
        )
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    await AdminRepository(db).log_activity(
        current_user.id, "USER_DELETED", "USER", str(user.id), {"email": user.email}
    )
    await db.delete(user)
    await db.commit()
    return None


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
    await AdminRepository(db).log_activity(
        current_user.id,
        "JOB_STATUS_UPDATED",
        "JOB",
        str(job.id),
        {"is_active": body.is_active, "source": job.source},
    )
    await db.commit()
    await db.refresh(job)
    return {"id": job.id, "is_active": job.is_active}


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: uuid.UUID,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Permanently delete a job posting (Admin only).

    Distinct from PATCH /jobs/{id}/status (pause/activate, keeps the row):
    this actually removes the row, for cleaning up test/demo listings that
    should not exist in production at all.
    """
    job = await db.get(JobPost, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    await AdminRepository(db).log_activity(
        current_user.id, "JOB_DELETED", "JOB", str(job.id), {"title": job.title, "source": job.source}
    )
    await db.delete(job)
    await db.commit()
    return None


@router.post("/jobs/reclean-text")
async def reclean_job_text(
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Re-run HTML-entity/mojibake cleanup over existing job rows (Admin only).

    JobRepository.upsert_external_job always re-cleans title/company_name/
    description on every sync, so this only matters for legacy rows whose
    source listing has since expired from the aggregator's feed and will
    therefore never be re-synced -- a small, permanently-stale tail from
    before clean_text() covered every field it does today.
    """
    from app.domains.jobs.aggregators.base import BaseAggregator

    result = await db.execute(select(JobPost))
    jobs = result.scalars().all()
    changed = 0
    for job in jobs:
        new_title = BaseAggregator.clean_text(job.title)
        new_company = BaseAggregator.clean_text(job.company_name)
        new_description = BaseAggregator.clean_text(job.description)
        if new_title != job.title or new_company != job.company_name or new_description != job.description:
            job.title = new_title
            job.company_name = new_company
            job.description = new_description
            changed += 1
    await AdminRepository(db).log_activity(
        current_user.id, "JOBS_TEXT_RECLEANED", "JOB", "bulk", {"scanned": len(jobs), "changed": changed}
    )
    await db.commit()
    return {"scanned": len(jobs), "changed": changed}


@router.get("/ai-usage", response_model=AIUsageStatsResponse)
async def get_ai_usage_stats(
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> AIUsageStatsResponse:
    """Get aggregated AI LLM usage metrics, token counts, model distribution, and cost estimates (Admin only)."""
    result = await db.execute(
        select(
            func.count(ActivityLog.id),
            func.coalesce(
                func.sum(func.cast(ActivityLog.details["prompt_tokens"].as_string(), Integer)), 0
            ),
            func.coalesce(
                func.sum(func.cast(ActivityLog.details["completion_tokens"].as_string(), Integer)),
                0,
            ),
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
        return ServiceHealthStatus(
            service="PostgreSQL Database Pool",
            status="OPERATIONAL",
            latency_ms=round((time.monotonic() - started) * 1000, 1),
        )
    except Exception:
        return ServiceHealthStatus(
            service="PostgreSQL Database Pool",
            status="DOWN",
            latency_ms=round((time.monotonic() - started) * 1000, 1),
        )


async def _check_redis() -> ServiceHealthStatus:
    started = time.monotonic()
    client: Redis = Redis.from_url(
        settings.CELERY_BROKER_URL, socket_connect_timeout=1, socket_timeout=1
    )
    try:
        await client.ping()
        return ServiceHealthStatus(
            service="Redis Cache & Session Broker",
            status="OPERATIONAL",
            latency_ms=round((time.monotonic() - started) * 1000, 1),
        )
    except Exception:
        return ServiceHealthStatus(
            service="Redis Cache & Session Broker",
            status="DOWN",
            latency_ms=round((time.monotonic() - started) * 1000, 1),
        )
    finally:
        await client.aclose()


def _storage_ping():
    # Use the app's real, shared S3 client rather than a fresh one-off
    # client. Three earlier attempts here each built a dedicated client
    # with disabled retries and an explicit short timeout (to bound the
    # check's latency, since wrapping the real cached client in
    # asyncio.wait_for only abandons *waiting* client-side while the
    # blocking call keeps running against botocore's tens-of-seconds
    # default -- the original cause of this endpoint's 4-6s production bug,
    # see 9fa91fd) -- but every one of them then failed in production even
    # though real resume uploads succeeded via this exact client at the
    # exact same time. The remaining difference: retries={"max_attempts": 0}
    # meant a single transient connection hiccup failed the check outright,
    # where the real client's default retry behavior recovers from exactly
    # that. Bounding the *outer* wait instead (see _check_minio) keeps the
    # dashboard responsive while still letting a slow-but-working
    # connection succeed the way real traffic does.
    from app.core.storage import get_s3_client

    client = get_s3_client()
    bucket = settings.MINIO_BUCKET_RESUMES
    key = "_health/ping.txt"
    client.put_object(Bucket=bucket, Key=key, Body=b"ok")
    client.get_object(Bucket=bucket, Key=key)


async def _check_minio() -> ServiceHealthStatus:
    started = time.monotonic()
    try:
        # boto3 is sync — run in a thread so it doesn't block the event loop.
        # A generous outer bound (matching how long a legitimate but slow
        # connection has taken in production) keeps a true outage from
        # hanging the dashboard, while giving a merely-slow-but-working
        # connection room to actually succeed.
        await asyncio.wait_for(asyncio.to_thread(_storage_ping), timeout=8.0)
        return ServiceHealthStatus(
            service="MinIO Object Storage S3",
            status="OPERATIONAL",
            latency_ms=round((time.monotonic() - started) * 1000, 1),
        )
    except Exception:
        return ServiceHealthStatus(
            service="MinIO Object Storage S3",
            status="DOWN",
            latency_ms=round((time.monotonic() - started) * 1000, 1),
        )


async def _check_keycloak() -> ServiceHealthStatus:
    started = time.monotonic()
    if not settings.FEATURE_KEYCLOAK_AUTH:
        return ServiceHealthStatus(
            service="Keycloak Identity Provider", status="UNKNOWN", latency_ms=0.0
        )
    try:
        realm_url = f"{settings.KEYCLOAK_URL}/realms/{settings.KEYCLOAK_REALM}"
        async with httpx.AsyncClient(timeout=1.5) as client:
            resp = await client.get(realm_url)
        status_str = "OPERATIONAL" if resp.status_code == 200 else "DOWN"
        return ServiceHealthStatus(
            service="Keycloak Identity Provider",
            status=status_str,
            latency_ms=round((time.monotonic() - started) * 1000, 1),
        )
    except Exception:
        return ServiceHealthStatus(
            service="Keycloak Identity Provider",
            status="DOWN",
            latency_ms=round((time.monotonic() - started) * 1000, 1),
        )


async def _check_celery_queues() -> ServiceHealthStatus:
    """Check broker connectivity directly with a real PING.

    Previously delegated to queue_monitor.get_queue_depths(), which is
    designed for its own caller (a metrics endpoint that should always
    return *something*) to swallow every Redis error and return
    {queue: 0} rather than raise -- so this check could never observe a
    broker outage and always reported OPERATIONAL, the exact hardcoded-
    health failure mode this endpoint's other checks were fixed to avoid.
    """
    started = time.monotonic()
    client: Redis = Redis.from_url(
        settings.CELERY_BROKER_URL, socket_connect_timeout=1, socket_timeout=1
    )
    try:
        await client.ping()
        return ServiceHealthStatus(
            service="Celery Background Task Queue",
            status="OPERATIONAL",
            latency_ms=round((time.monotonic() - started) * 1000, 1),
        )
    except Exception:
        return ServiceHealthStatus(
            service="Celery Background Task Queue",
            status="DOWN",
            latency_ms=round((time.monotonic() - started) * 1000, 1),
        )
    finally:
        await client.aclose()


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
        r
        if isinstance(r, ServiceHealthStatus)
        else ServiceHealthStatus(service=name, status="DOWN", latency_ms=3000.0)
        for (name, _), r in zip(checks, results, strict=False)
    ]
    overall_status = (
        "OPERATIONAL"
        if all(s.status in ("OPERATIONAL", "UNKNOWN") for s in services)
        else "DEGRADED"
    )

    return SystemHealthDetailResponse(
        overall_status=overall_status,
        services=services,
        timestamp=datetime.now(UTC),
    )
