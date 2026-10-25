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
