"""
Staff console: background processing (queues, runs, dead letters, import sources).

Every endpoint requires the ADMIN role. Writes require a reason and are audited.
Nothing here returns job content or personal data: runs carry source names,
counts and error categories only.
"""

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit_event
from app.core.database import get_db
from app.domains.auth.dependencies import require_role
from app.domains.auth.models import User, UserRole
from app.domains.tasks.models import DeadLetter, JobImportCheckpoint, JobSource, TaskRun
from app.domains.tasks.service import TASK_IMPORT_SOURCE, TaskService

router = APIRouter(prefix="/admin/background", tags=["Admin Background"])
staff = require_role(UserRole.ADMIN)


class Reason(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class SourcePatch(Reason):
    enabled: bool | None = None
    cron: str | None = Field(default=None, min_length=9, max_length=64)
    max_per_run: int | None = Field(default=None, ge=1, le=50000)
    rate_limit_per_minute: int | None = Field(default=None, ge=1, le=6000)
    permission_confirmed: bool | None = None


class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str
    enabled: bool
    cron: str
    max_per_run: int
    rate_limit_per_minute: int
    permission_confirmed: bool
    last_enqueued_at: datetime | None
    last_success_at: datetime | None = None
    last_error: str | None = None
    consecutive_failures: int = 0


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    task_name: str
    status: str
    attempts: int
    max_attempts: int
    args: dict[str, Any]
    scheduled_for: datetime | None
    started_at: datetime | None
    finished_at: datetime | None
    next_retry_at: datetime | None
    worker_id: str | None
    error: str | None
    result: dict[str, Any] | None
    created_at: datetime


class DeadLetterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    task_run_id: uuid.UUID
    task_name: str
    args: dict[str, Any]
    error: str | None
    created_at: datetime
    retried_at: datetime | None
    retried_run_id: uuid.UUID | None


class OverviewOut(BaseModel):
    runs_by_status: dict[str, int]
    dead_letters_open: int
    undispatched_outbox: int
    liveness: dict[str, dict[str, Any]]
    dispatch_disabled: bool


@router.get("/overview", response_model=OverviewOut)
async def overview(
    _admin: User = Depends(staff), db: AsyncSession = Depends(get_db)
) -> OverviewOut:
    from app.core.config import settings
    from app.domains.tasks.models import OutboxEvent

    by_status = {
        s: int(c)
        for s, c in (
            await db.execute(select(TaskRun.status, func.count()).group_by(TaskRun.status))
        ).all()
    }
    dead = int(
        (
            await db.execute(
                select(func.count()).select_from(DeadLetter).where(DeadLetter.retried_at.is_(None))
            )
        ).scalar_one()
    )
    undispatched = int(
        (
            await db.execute(
                select(func.count())
                .select_from(OutboxEvent)
                .where(OutboxEvent.dispatched_at.is_(None))
            )
        ).scalar_one()
    )
    return OverviewOut(
        runs_by_status=by_status,
        dead_letters_open=dead,
        undispatched_outbox=undispatched,
        liveness=await TaskService(db).liveness(),
        dispatch_disabled=settings.TASKS_DISPATCH_DISABLED,
    )


@router.get("/runs", response_model=list[RunOut])
async def list_runs(
    _admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
    status_: str | None = Query(default=None, alias="status", max_length=16),
    task: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[TaskRun]:
    stmt = select(TaskRun).order_by(TaskRun.created_at.desc()).limit(limit).offset(offset)
    if status_:
        stmt = stmt.where(TaskRun.status == status_.upper())
    if task:
        stmt = stmt.where(TaskRun.task_name == task)
    return list((await db.execute(stmt)).scalars().all())


@router.get("/dead-letters", response_model=list[DeadLetterOut])
async def list_dead_letters(
    _admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
    include_retried: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[DeadLetter]:
    stmt = select(DeadLetter).order_by(DeadLetter.created_at.desc()).limit(limit)
    if not include_retried:
        stmt = stmt.where(DeadLetter.retried_at.is_(None))
    return list((await db.execute(stmt)).scalars().all())


@router.post("/dead-letters/{dead_id}/retry", response_model=RunOut)
async def retry_dead_letter(
    dead_id: uuid.UUID,
    body: Reason,
    request: Request,
    admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
) -> TaskRun:
    run = await TaskService(db).retry_dead_letter(dead_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dead letter not found or already retried")
    await record_audit_event(
        db,
        action="background.dead_letter.retry",
        resource_type="dead_letter",
        resource_id=str(dead_id),
        actor_id=admin.id,
        actor_role=admin.role.value,
        payload={"reason": body.reason, "run_id": str(run.id)},
        request=request,
    )
    await db.commit()
    return run


@router.get("/sources", response_model=list[SourceOut])
async def list_sources(
    _admin: User = Depends(staff), db: AsyncSession = Depends(get_db)
) -> list[SourceOut]:
    from app.domains.jobs.service import AGGREGATORS

    service = TaskService(db)
    await service.ensure_sources([a.source_name for a in AGGREGATORS])
    sources = (await db.execute(select(JobSource).order_by(JobSource.name))).scalars().all()
    checkpoints = {
        cp.source: cp for cp in (await db.execute(select(JobImportCheckpoint))).scalars().all()
    }
    out: list[SourceOut] = []
    for s in sources:
        cp = checkpoints.get(s.name)
        item = SourceOut.model_validate(s)
        if cp is not None:
            item.last_success_at = cp.last_success_at
            item.last_error = cp.last_error
            item.consecutive_failures = cp.consecutive_failures
        out.append(item)
    return out


@router.patch("/sources/{name}", response_model=SourceOut)
async def patch_source(
    name: str,
    body: SourcePatch,
    request: Request,
    admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
) -> SourceOut:
    source = await db.get(JobSource, name.upper())
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown job source")
    changes: dict[str, Any] = {}
    if body.cron is not None:
        from croniter import croniter

        if not croniter.is_valid(body.cron):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Invalid cron expression")
    for field in (
        "enabled",
        "cron",
        "max_per_run",
        "rate_limit_per_minute",
        "permission_confirmed",
    ):
        value = getattr(body, field)
        if value is not None and value != getattr(source, field):
            changes[field] = {"from": getattr(source, field), "to": value}
            setattr(source, field, value)
    await record_audit_event(
        db,
        action="background.source.update",
        resource_type="job_source",
        resource_id=source.name,
        actor_id=admin.id,
        actor_role=admin.role.value,
        payload={"reason": body.reason, "changes": changes},
        request=request,
    )
    await db.commit()
    await db.refresh(source)
    return SourceOut.model_validate(source)


@router.post("/sources/{name}/run", response_model=RunOut, status_code=status.HTTP_202_ACCEPTED)
async def run_source_now(
    name: str,
    body: Reason,
    request: Request,
    admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
) -> TaskRun:
    source = await db.get(JobSource, name.upper())
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown job source")
    if not source.permission_confirmed:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Source permission is not confirmed; imports are blocked"
        )
    run, created = await TaskService(db).enqueue(
        TASK_IMPORT_SOURCE,
        {"source": source.name, "limit": source.max_per_run},
        idempotency_key=f"manual:{source.name}:{uuid.uuid4().hex[:12]}",
        max_attempts=1,
    )
    await record_audit_event(
        db,
        action="background.source.manual_import",
        resource_type="job_source",
        resource_id=source.name,
        actor_id=admin.id,
        actor_role=admin.role.value,
        payload={"reason": body.reason, "run_id": str(run.id), "created": created},
        request=request,
    )
    await db.commit()
    return run
