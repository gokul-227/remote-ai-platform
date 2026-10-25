"""
Staff console operations: announcements, contract oversight and assistant activity.

Every staff endpoint requires the ADMIN role; writes are audited. The public
`/announcements/active` read lets the product show current banners to members.
"""

import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit_event
from app.core.database import get_db
from app.domains.admin.announcement_models import Announcement
from app.domains.assistant.models import AssistantAction
from app.domains.auth.dependencies import get_current_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.contracts.models import Contract

router = APIRouter(tags=["Admin Operations"])
staff = require_role(UserRole.ADMIN)


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1, max_length=2000)
    severity: Literal["INFO", "WARNING", "CRITICAL"] = "INFO"
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class AnnouncementPatch(BaseModel):
    active: bool


class AnnouncementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str
    body: str
    severity: str
    active: bool
    starts_at: datetime | None
    ends_at: datetime | None
    created_at: datetime


def _now() -> datetime:
    return datetime.now(UTC)


@router.get("/announcements/active", response_model=list[AnnouncementOut])
async def active_announcements(
    _user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[Announcement]:
    now = _now()
    rows = await db.execute(
        select(Announcement)
        .where(
            Announcement.active.is_(True),
            or_(Announcement.starts_at.is_(None), Announcement.starts_at <= now),
            or_(Announcement.ends_at.is_(None), Announcement.ends_at > now),
        )
        .order_by(Announcement.created_at.desc())
        .limit(3)
    )
    return list(rows.scalars().all())


@router.get("/admin/announcements", response_model=list[AnnouncementOut])
async def list_announcements(
    _admin: User = Depends(staff), db: AsyncSession = Depends(get_db)
) -> list[Announcement]:
    rows = await db.execute(
        select(Announcement).order_by(Announcement.created_at.desc()).limit(100)
    )
    return list(rows.scalars().all())


@router.post(
    "/admin/announcements", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED
)
async def create_announcement(
    body: AnnouncementIn,
    request: Request,
    admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
) -> Announcement:
    if body.starts_at and body.ends_at and body.ends_at <= body.starts_at:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "The end must be after the start"
        )
    item = Announcement(**body.model_dump(), created_by=admin.id)
    db.add(item)
    await db.flush()
    await record_audit_event(
        db,
        actor_id=admin.id,
        action="admin.announcement.create",
        resource_type="announcement",
        resource_id=str(item.id),
        request=request,
        actor_role="ADMIN",
        payload={"title": body.title, "severity": body.severity},
    )
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/admin/announcements/{item_id}", response_model=AnnouncementOut)
async def update_announcement(
    item_id: uuid.UUID,
    body: AnnouncementPatch,
    request: Request,
    admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
) -> Announcement:
    item = await db.get(Announcement, item_id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Announcement not found")
    item.active = body.active
    await record_audit_event(
        db,
        actor_id=admin.id,
        action="admin.announcement.update",
        resource_type="announcement",
        resource_id=str(item.id),
        request=request,
        actor_role="ADMIN",
        payload={"active": body.active},
    )
    await db.commit()
    await db.refresh(item)
    return item


@router.get("/admin/contracts")
async def list_contracts(
    status_filter: str | None = Query(None, alias="status", max_length=30),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    q = select(Contract).order_by(Contract.created_at.desc()).offset(offset).limit(limit)
    if status_filter:
        q = q.where(Contract.status == status_filter.upper())
    contracts = list((await db.execute(q)).scalars().all())
    ids = {c.client_id for c in contracts} | {c.worker_id for c in contracts}
    people = (
        {u.id: u for u in (await db.execute(select(User).where(User.id.in_(ids)))).scalars().all()}
        if ids
        else {}
    )

    def who(uid: uuid.UUID) -> dict[str, Any]:
        u = people.get(uid)
        return {"id": uid, "name": u.full_name if u else None, "email": u.email if u else None}

    return [
        {
            "id": c.id,
            "title": c.title,
            "status": c.status,
            "rate_type": c.rate_type,
            "rate_amount": c.rate_amount,
            "currency": c.currency,
            "client": who(c.client_id),
            "worker": who(c.worker_id),
            "created_at": c.created_at,
        }
        for c in contracts
    ]


@router.get("/admin/assistant-actions")
async def list_assistant_actions(
    status_filter: str | None = Query(None, alias="status", max_length=20),
    limit: int = Query(100, ge=1, le=200),
    _admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    q = (
        select(AssistantAction, User.email)
        .join(User, User.id == AssistantAction.user_id)
        .order_by(AssistantAction.created_at.desc())
        .limit(limit)
    )
    if status_filter:
        q = q.where(AssistantAction.status == status_filter.upper())
    rows = (await db.execute(q)).all()
    # Arguments can hold user content: staff see the tool, summary and outcome only.
    return [
        {
            "id": a.id,
            "user_email": email,
            "tool": a.tool,
            "summary": a.summary,
            "status": a.status,
            "created_at": a.created_at,
            "executed_at": a.executed_at,
        }
        for a, email in rows
    ]


# Free-tier limits of the services this platform runs on (what the usage page measures against).
FREE_LIMITS = {
    "database_bytes": 500 * 1024 * 1024,  # Supabase Free: 500 MB database
    "monthly_active_users": 50_000,  # Supabase Free auth
    "emails_per_day": 100,  # Resend Free
    "emails_per_month": 3_000,  # Resend Free
    "google_indexing_per_day": 200,  # Google Indexing API default quota
}
PROVIDER_DASHBOARDS = {
    "Supabase (database, sign-in, storage)": "https://supabase.com/dashboard/project/_/settings/billing/usage",
    "Render (API server hours)": "https://dashboard.render.com/billing",
    "Cloudflare Workers (web requests per day)": "https://dash.cloudflare.com/?to=/:account/workers/plans",
    "Upstash Redis (commands per month)": "https://console.upstash.com",
    "Resend (all emails incl. sign-in codes)": "https://resend.com/emails",
    "Sentry (errors per month)": "https://sentry.io/stats/",
    "Google Search Console (indexing)": "https://search.google.com/search-console",
    "UptimeRobot (uptime)": "https://dashboard.uptimerobot.com",
}


@router.get("/admin/usage")
async def platform_usage(
    _admin: User = Depends(staff), db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    """Live counts measured against the free-tier limits, plus links to provider dashboards."""
    from sqlalchemy import func, text

    from app.domains.admin.models import ApiSyncLog
    from app.domains.jobs.models import JobPost
    from app.domains.notifications.models import EmailOutbox
    from app.domains.social.models import Post
    from app.services.ai.models import AIUsageLog

    now = _now()
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month = day.replace(day=1)

    async def scalar(stmt: Any) -> int:
        return int((await db.execute(stmt)).scalar() or 0)

    db_bytes: int | None = None
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db_bytes = await scalar(text("select pg_database_size(current_database())"))
    by_source: dict[str, int] = dict(
        (
            await db.execute(
                select(JobPost.source, func.count())
                .where(JobPost.is_deleted.is_(False), JobPost.expired_at.is_(None))
                .group_by(JobPost.source)
            )
        )
        .tuples()
        .all()
    )
    latest = (
        select(ApiSyncLog.source, func.max(ApiSyncLog.created_at).label("at"))
        .group_by(ApiSyncLog.source)
        .subquery()
    )
    runs = (
        await db.execute(
            select(ApiSyncLog).join(
                latest,
                (ApiSyncLog.source == latest.c.source) & (ApiSyncLog.created_at == latest.c.at),
            )
        )
    ).scalars()
    return {
        "measured_at": now,
        "limits": FREE_LIMITS,
        "database_bytes": db_bytes,
        "users_total": await scalar(select(func.count()).select_from(User)),
        "users_new_this_month": await scalar(
            select(func.count()).select_from(User).where(User.created_at >= month)
        ),
        "jobs_live": sum(by_source.values()),
        "jobs_by_source": dict(sorted(by_source.items(), key=lambda kv: -kv[1])),
        "posts_total": await scalar(select(func.count()).select_from(Post)),
        "emails_sent_today": await scalar(
            select(func.count()).select_from(EmailOutbox).where(EmailOutbox.sent_at >= day)
        ),
        "emails_sent_this_month": await scalar(
            select(func.count()).select_from(EmailOutbox).where(EmailOutbox.sent_at >= month)
        ),
        "ai_calls_this_month": await scalar(
            select(func.count()).select_from(AIUsageLog).where(AIUsageLog.created_at >= month)
        ),
        "last_import": [
            {
                "source": r.source,
                "status": r.status,
                "at": r.created_at,
                "fetched": r.jobs_fetched,
                "new": r.jobs_inserted,
                "error": r.error_message,
            }
            for r in sorted(runs, key=lambda r: r.source)
        ],
        "dashboards": PROVIDER_DASHBOARDS,
    }


@router.get("/admin/search-status")
async def search_status(_admin: User = Depends(staff)) -> dict[str, Any]:
    """Google Search Console summary for the staff console (staff only)."""
    from app.services.search.indexing import search_console_report

    try:
        return await search_console_report()
    except Exception as exc:  # report, don't fail the page
        return {"configured": True, "error": type(exc).__name__}
