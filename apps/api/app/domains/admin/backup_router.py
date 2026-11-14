"""
Backup and restore evidence, and the service catalogue.

    POST /ops/backups/report      called by ops/backup/backup.sh and restore.sh with
                                  X-Backup-Report-Token (BACKUP_REPORT_TOKEN); records a run
    GET  /admin/backups           recent runs and freshness (staff)
    GET  /admin/catalogue         platform components: owner, dependencies, runbook, live state (staff)

The report endpoint accepts facts only from a holder of the dedicated token; it
stores metadata (archive name, checksum, counts, target label), never
credentials or contents. "Fresh" means a successful backup in the last 26 hours
and a verified restore in the last 35 days.
"""

import hmac
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import JSON, BigInteger, DateTime, Integer, String, func, select
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.core.database import Base, get_db
from app.domains.auth.dependencies import require_role
from app.domains.auth.models import User, UserRole

ops_router = APIRouter(prefix="/ops", tags=["Operations Evidence"])
router = APIRouter(prefix="/admin", tags=["Admin Backups & Catalogue"])
staff = require_role(UserRole.ADMIN)

BACKUP_FRESH = timedelta(hours=26)
RESTORE_FRESH = timedelta(days=35)


class BackupRun(Base):
    __tablename__ = "backup_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # backup | restore_verify
    environment: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False)  # success | failed
    archive_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    tables: Mapped[int | None] = mapped_column(Integer, nullable=True)
    objects: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    detail: Mapped[dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=False, default=dict
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class BackupReport(BaseModel):
    kind: Literal["backup", "restore_verify"]
    environment: str = Field(min_length=2, max_length=20, pattern="^[a-z]+$")
    status: Literal["success", "failed"]
    archive_name: str | None = Field(default=None, max_length=200, pattern=r"^[A-Za-z0-9._-]+$")
    sha256: str | None = Field(default=None, pattern="^[0-9a-f]{64}$")
    size_bytes: int | None = Field(default=None, ge=0)
    tables: int | None = Field(default=None, ge=0)
    objects: int | None = Field(default=None, ge=0)
    target_label: str | None = Field(default=None, max_length=120)
    error: str | None = Field(default=None, max_length=300)
    started_at: datetime | None = None
    finished_at: datetime


def _aware(ts: datetime | None) -> datetime | None:
    if ts is None:
        return None
    return ts if ts.tzinfo else ts.replace(tzinfo=UTC)


@ops_router.post("/backups/report", status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def report_backup(
    body: BackupReport,
    x_backup_report_token: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    expected = settings.BACKUP_REPORT_TOKEN
    if (
        not expected
        or not x_backup_report_token
        or not hmac.compare_digest(x_backup_report_token, expected)
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid report token")
    run = BackupRun(
        kind=body.kind,
        environment=body.environment,
        status=body.status,
        archive_name=body.archive_name,
        sha256=body.sha256,
        size_bytes=body.size_bytes,
        tables=body.tables,
        objects=body.objects,
        target_label=body.target_label,
        detail={"error": body.error} if body.error else {},
        started_at=body.started_at,
        finished_at=body.finished_at,
    )
    db.add(run)
    await db.flush()
    return {"id": str(run.id)}


async def backup_summary(db: AsyncSession) -> dict[str, Any]:
    now = datetime.now(UTC)

    async def latest(kind: str) -> BackupRun | None:
        return await db.scalar(
            select(BackupRun)
            .where(
                BackupRun.kind == kind,
                BackupRun.status == "success",
                BackupRun.environment == settings.APP_ENV,
            )
            .order_by(BackupRun.finished_at.desc())
            .limit(1)
        )

    b, r = await latest("backup"), await latest("restore_verify")
    b_at, r_at = _aware(b.finished_at) if b else None, _aware(r.finished_at) if r else None
    if b_at is None:
        state = "no_evidence"
    elif now - b_at > BACKUP_FRESH:
        state = "backup_stale"
    elif r_at is None or now - r_at > RESTORE_FRESH:
        state = "restore_unverified"
    else:
        state = "ok"
    return {
        "status": state,
        "environment": settings.APP_ENV,
        "last_backup_at": b_at,
        "last_backup_archive": b.archive_name if b else None,
        "last_restore_verified_at": r_at,
        "last_restore_target": r.target_label if r else None,
        "freshness": {
            "backup_hours": BACKUP_FRESH.total_seconds() / 3600,
            "restore_days": RESTORE_FRESH.days,
        },
        "runbook": "ops/backup/README.md",
    }


@router.get("/backups")
async def list_backups(
    _: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=30, ge=1, le=200),
) -> dict[str, Any]:
    rows = (
        (await db.execute(select(BackupRun).order_by(BackupRun.finished_at.desc()).limit(limit)))
        .scalars()
        .all()
    )
    return {
        "summary": await backup_summary(db),
        "runs": [
            {
                "id": str(x.id),
                "kind": x.kind,
                "environment": x.environment,
                "status": x.status,
                "archive_name": x.archive_name,
                "sha256": x.sha256,
                "size_bytes": x.size_bytes,
                "tables": x.tables,
                "objects": x.objects,
                "target_label": x.target_label,
                "error": x.detail.get("error"),
                "finished_at": _aware(x.finished_at),
            }
            for x in rows
        ],
    }


# Component catalogue (a Backstage-style inventory, kept small and in code so it
# always matches what is deployed). `check` names a key in /health/dependencies.
CATALOGUE: tuple[dict[str, Any], ...] = (
    {
        "id": "web",
        "name": "Web application",
        "kind": "frontend",
        "host": "Cloudflare Workers",
        "owner": "Platform owner",
        "depends_on": ["api"],
        "runbook": "handbook/03-deployment-and-infrastructure.md",
        "check": None,
    },
    {
        "id": "admin",
        "name": "Staff console",
        "kind": "frontend",
        "host": "Cloudflare Workers (static)",
        "owner": "Platform owner",
        "depends_on": ["api"],
        "runbook": "handbook/14-admin-manual.md",
        "check": None,
    },
    {
        "id": "api",
        "name": "Backend API",
        "kind": "service",
        "host": "Render (Oracle VM after cut-over)",
        "owner": "Platform owner",
        "depends_on": ["database", "redis", "storage", "ai"],
        "runbook": "go-live/incident-runbook.md",
        "check": None,
    },
    {
        "id": "worker",
        "name": "Background worker",
        "kind": "service",
        "host": "Oracle VM (Docker Compose)",
        "owner": "Platform owner",
        "depends_on": ["redis", "database"],
        "runbook": "handbook/07-background-processing.md",
        "check": "worker",
    },
    {
        "id": "scheduler",
        "name": "Scheduler (Celery Beat)",
        "kind": "service",
        "host": "Oracle VM (Docker Compose)",
        "owner": "Platform owner",
        "depends_on": ["redis", "database"],
        "runbook": "handbook/07-background-processing.md",
        "check": "scheduler",
    },
    {
        "id": "database",
        "name": "PostgreSQL",
        "kind": "datastore",
        "host": "Supabase",
        "owner": "Platform owner",
        "depends_on": [],
        "runbook": "go-live/backup-and-restore.md",
        "check": "database",
    },
    {
        "id": "redis",
        "name": "Redis (broker, cache)",
        "kind": "datastore",
        "host": "Upstash / VM-local",
        "owner": "Platform owner",
        "depends_on": [],
        "runbook": "transformation/owner-infrastructure-guide.md",
        "check": "redis",
    },
    {
        "id": "storage",
        "name": "Object storage",
        "kind": "datastore",
        "host": "Supabase Storage / Cloudflare R2",
        "owner": "Platform owner",
        "depends_on": [],
        "runbook": "ops/storage/migrate_objects.py",
        "check": "storage",
    },
    {
        "id": "auth",
        "name": "Sign-in (Supabase Auth)",
        "kind": "external",
        "host": "Supabase",
        "owner": "Platform owner",
        "depends_on": [],
        "runbook": "handbook/04-secrets-and-credentials.md",
        "check": None,
    },
    {
        "id": "ai",
        "name": "AI providers (free-tier chain)",
        "kind": "external",
        "host": "LiteLLM",
        "owner": "Platform owner",
        "depends_on": [],
        "runbook": "handbook/02-tech-stack.md",
        "check": "ai",
    },
    {
        "id": "email",
        "name": "Email (Resend)",
        "kind": "external",
        "host": "Resend",
        "owner": "Platform owner",
        "depends_on": [],
        "runbook": "handbook/03-deployment-and-infrastructure.md",
        "check": None,
    },
    {
        "id": "push",
        "name": "Browser push (FCM)",
        "kind": "external",
        "host": "Firebase",
        "owner": "Platform owner",
        "depends_on": ["worker"],
        "runbook": "transformation/owner-infrastructure-guide.md",
        "check": None,
    },
)


@router.get("/catalogue")
async def catalogue(_: User = Depends(staff), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    from app.core.health import _check_database, _check_redis, _check_storage
    from app.domains.notifications.push import push_enabled
    from app.domains.tasks.service import TaskService
    from app.services.email.outbox import email_enabled

    probes: dict[str, str] = {}
    checks = {
        "database": _check_database(db),
        "redis": _check_redis(),
        "storage": _check_storage(),
    }
    for key, pending in checks.items():
        try:
            probes[key] = (await pending).status
        except Exception:
            probes[key] = "DOWN"
    try:
        liveness = await TaskService(db).liveness()
        for kind in ("worker", "scheduler"):
            e = liveness.get(kind)
            probes[kind] = "UNKNOWN" if e is None else ("HEALTHY" if e["fresh"] > 0 else "DEGRADED")
    except Exception:
        probes["worker"] = probes["scheduler"] = "UNKNOWN"
    probes["ai"] = "CONFIGURED" if settings.AI_FREE_TIER_CHAIN else "NOT_CONFIGURED"
    configured = {
        "push": push_enabled(),
        "email": email_enabled(),
        "auth": bool(settings.SUPABASE_URL),
    }
    items = []
    for c in CATALOGUE:
        if c["check"]:
            state = probes.get(c["check"], "UNKNOWN")
        elif c["id"] in configured:
            state = "CONFIGURED" if configured[c["id"]] else "NOT_CONFIGURED"
        else:
            state = "NOT_PROBED"
        items.append({**{k: v for k, v in c.items() if k != "check"}, "status": state})
    return {
        "measured_at": datetime.now(UTC),
        "components": items,
        "backup": await backup_summary(db),
    }
