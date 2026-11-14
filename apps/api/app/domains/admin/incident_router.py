"""Bounded incident operations. Every mutation and its audit event commit atomically."""

import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit_event
from app.core.database import get_db
from app.domains.admin.incident_models import Incident
from app.domains.admin.models import AuditEvent
from app.domains.auth.dependencies import require_role
from app.domains.auth.models import User, UserRole

router = APIRouter(prefix="/admin/incidents", tags=["Admin Incidents"])
staff = require_role(UserRole.ADMIN)
Severity = Literal["SEV1", "SEV2", "SEV3", "SEV4"]
Status = Literal["OPEN", "ACKNOWLEDGED", "INVESTIGATING", "MONITORING", "RESOLVED"]
TRANSITIONS = {
    "OPEN": {"ACKNOWLEDGED"},
    "ACKNOWLEDGED": {"INVESTIGATING", "RESOLVED"},
    "INVESTIGATING": {"MONITORING", "RESOLVED"},
    "MONITORING": {"INVESTIGATING", "RESOLVED"},
    "RESOLVED": {"OPEN"},
}


class Reason(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    reason: str = Field(min_length=3, max_length=1000)


class IncidentIn(Reason):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=10000)
    service: str = Field(min_length=1, max_length=120)
    severity: Severity = "SEV3"
    assignee_id: uuid.UUID | None = None


class IncidentPatch(Reason):
    version: int = Field(ge=1)
    severity: Severity | None = None
    status: Status | None = None
    assignee_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def changes_required(self):
        fields = self.model_fields_set & {"severity", "status", "assignee_id"}
        if not fields or any(getattr(self, f) is None for f in fields - {"assignee_id"}):
            raise ValueError("Provide a status, severity or assignee change")
        return self


class IncidentNote(Reason):
    body: str = Field(min_length=1, max_length=4000)


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str
    description: str
    service: str
    severity: str
    status: str
    assignee_id: uuid.UUID | None
    created_by: uuid.UUID | None
    version: int
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None


async def assigned_staff(db, uid):
    if uid is not None:
        user = await db.get(User, uid)
        if not user or user.role != UserRole.ADMIN or not user.is_active:
            raise HTTPException(422, "Assignee must be active staff")


async def get_incident(db, item_id):
    item = await db.get(Incident, item_id)
    if not item:
        raise HTTPException(404, "Incident not found")
    return item


async def audit(db, admin, request, item, action, payload):
    await record_audit_event(
        db,
        actor_id=admin.id,
        actor_role="ADMIN",
        request=request,
        action=f"admin.incident.{action}",
        resource_type="incident",
        resource_id=str(item.id),
        payload=payload,
    )


@router.get("", response_model=list[IncidentOut])
async def list_incidents(
    status: Status | None = None,
    severity: Severity | None = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(Incident)
        .order_by(Incident.created_at.desc(), Incident.id)
        .limit(limit)
        .offset(offset)
    )
    if status:
        q = q.where(Incident.status == status)
    if severity:
        q = q.where(Incident.severity == severity)
    return list((await db.scalars(q)).all())


@router.post("", response_model=IncidentOut, status_code=201)
async def create_incident(
    body: IncidentIn,
    request: Request,
    admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
):
    await assigned_staff(db, body.assignee_id)
    item = Incident(**body.model_dump(exclude={"reason"}), created_by=admin.id)
    db.add(item)
    await db.flush()
    await audit(
        db, admin, request, item, "create", {"reason": body.reason, "severity": item.severity}
    )
    await db.commit()
    await db.refresh(item)
    return item


@router.get("/{item_id}", response_model=IncidentOut)
async def detail(
    item_id: uuid.UUID, admin: User = Depends(staff), db: AsyncSession = Depends(get_db)
):
    return await get_incident(db, item_id)


@router.patch("/{item_id}", response_model=IncidentOut)
async def change(
    item_id: uuid.UUID,
    body: IncidentPatch,
    request: Request,
    admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
):
    item = await get_incident(db, item_id)
    if item.version != body.version:
        raise HTTPException(409, "Incident changed; reload before updating")
    changes = body.model_dump(exclude_unset=True, exclude={"reason", "version"}, mode="json")
    if "assignee_id" in changes:
        await assigned_staff(db, body.assignee_id)
    if body.status and body.status not in TRANSITIONS[item.status]:
        raise HTTPException(409, "Invalid incident status transition")
    before = {k: str(getattr(item, k)) if getattr(item, k) is not None else None for k in changes}
    values = body.model_dump(exclude_unset=True, exclude={"reason", "version"})
    values.update(version=body.version + 1, updated_at=datetime.now(UTC))
    if body.status:
        values["resolved_at"] = datetime.now(UTC) if body.status == "RESOLVED" else None
    result = await db.execute(
        update(Incident)
        .where(Incident.id == item_id, Incident.version == body.version)
        .values(**values)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:  # type: ignore[attr-defined]
        raise HTTPException(409, "Incident changed; reload before updating")
    await audit(
        db,
        admin,
        request,
        item,
        "update",
        {"reason": body.reason, "before": before, "after": changes},
    )
    await db.commit()
    await db.refresh(item)
    return item


@router.get("/{item_id}/activity")
async def activity(
    item_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
):
    await get_incident(db, item_id)
    events = (
        await db.scalars(
            select(AuditEvent)
            .where(AuditEvent.resource_type == "incident", AuditEvent.resource_id == str(item_id))
            .order_by(AuditEvent.created_at.desc(), AuditEvent.id)
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return [
        {
            "id": e.id,
            "actor_id": e.actor_id,
            "action": e.action,
            "created_at": e.created_at,
            "payload": e.payload,
        }
        for e in events
    ]


@router.post("/{item_id}/notes", status_code=201)
async def note(
    item_id: uuid.UUID,
    body: IncidentNote,
    request: Request,
    admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
):
    item = await get_incident(db, item_id)
    await audit(db, admin, request, item, "note", body.model_dump())
    await db.commit()
    return {"ok": True}
