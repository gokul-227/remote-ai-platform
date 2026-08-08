"""
API Router for Admin domain.
"""

import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.admin.schemas import ActivityLogResponse, ApiSyncLogResponse, JobStatusUpdate, PlatformStatsResponse, UserStatusUpdate
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
