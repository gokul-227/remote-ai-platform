"""
Support domain FastAPI routers.

`router` is the requester's side (own tickets only; staff notes hidden).
`staff_router` is the admin queue: filters, SLA/overdue, assignment, severity,
status with a required reason, internal notes, optimistic concurrency, audit.
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit_event
from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.support.models import SupportMessage, SupportTicket
from app.domains.support.schemas import (
    MessageCreate,
    MessageOut,
    StaffMessageCreate,
    StaffTicketDetail,
    StaffTicketOut,
    StaffTicketUpdate,
    TicketCreate,
    TicketDetail,
    TicketOut,
)
from app.services.notifications import notify_user

router = APIRouter(prefix="/support/tickets", tags=["Support"])
staff_router = APIRouter(prefix="/admin/support/tickets", tags=["Admin support"])

# First-response targets by severity. SAFETY reports start HIGH.
SLA = {"URGENT": timedelta(hours=4), "HIGH": timedelta(hours=24), "NORMAL": timedelta(hours=72), "LOW": timedelta(days=7)}
OPEN_STATUSES = {"OPEN", "IN_PROGRESS", "WAITING_ON_USER"}
MAX_OPEN_PER_USER = 10


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(dt: datetime | None) -> datetime | None:
    return dt.replace(tzinfo=UTC) if dt is not None and dt.tzinfo is None else dt


def _staff_out(t: SupportTicket, email: str | None = None) -> StaffTicketOut:
    out = StaffTicketOut.model_validate(t)
    due = _aware(t.sla_due_at)
    out.overdue = t.first_response_at is None and t.status in OPEN_STATUSES and due is not None and due < _now()
    out.requester_email = email
    return out


async def _messages(db: AsyncSession, t: SupportTicket, include_internal: bool) -> list[MessageOut]:
    q = select(SupportMessage).where(SupportMessage.ticket_id == t.id)
    if not include_internal:
        q = q.where(SupportMessage.internal.is_(False))
    rows = (await db.execute(q.order_by(SupportMessage.created_at, SupportMessage.id).limit(500))).scalars()
    out = []
    for m in rows:
        mo = MessageOut.model_validate(m)
        mo.from_staff = m.author_id != t.requester_id
        out.append(mo)
    return out


async def _own_ticket(db: AsyncSession, ticket_id: uuid.UUID, user: User) -> SupportTicket:
    t = await db.get(SupportTicket, ticket_id)
    if t is None or t.requester_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return t


@router.post("", response_model=TicketDetail, status_code=status.HTTP_201_CREATED)
async def open_ticket(
    payload: TicketCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> TicketDetail:
    open_count = await db.scalar(
        select(func.count()).select_from(SupportTicket).where(
            SupportTicket.requester_id == current_user.id, SupportTicket.status.in_(OPEN_STATUSES)
        )
    )
    if (open_count or 0) >= MAX_OPEN_PER_USER:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "You have too many open tickets; please reply on an existing one")
    severity = "HIGH" if payload.category == "SAFETY" else "NORMAL"
    t = SupportTicket(
        requester_id=current_user.id,
        subject=payload.subject.strip(),
        category=payload.category,
        severity=severity,
        sla_due_at=_now() + SLA[severity],
    )
    db.add(t)
    await db.flush()
    db.add(SupportMessage(ticket_id=t.id, author_id=current_user.id, body=payload.body))
    await db.flush()
    await db.refresh(t)
    return TicketDetail(ticket=TicketOut.model_validate(t), messages=await _messages(db, t, False))


@router.get("", response_model=list[TicketOut])
async def my_tickets(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[SupportTicket]:
    rows = await db.execute(
        select(SupportTicket).where(SupportTicket.requester_id == current_user.id).order_by(SupportTicket.created_at.desc()).limit(100)
    )
    return list(rows.scalars())


@router.get("/{ticket_id}", response_model=TicketDetail)
async def my_ticket(
    ticket_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> TicketDetail:
    t = await _own_ticket(db, ticket_id, current_user)
    return TicketDetail(ticket=TicketOut.model_validate(t), messages=await _messages(db, t, False))


@router.post("/{ticket_id}/messages", response_model=TicketDetail)
async def reply(
    ticket_id: uuid.UUID,
    payload: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TicketDetail:
    t = await _own_ticket(db, ticket_id, current_user)
    if t.status == "CLOSED":
        raise HTTPException(status.HTTP_409_CONFLICT, "This ticket is closed; open a new one")
    db.add(SupportMessage(ticket_id=t.id, author_id=current_user.id, body=payload.body))
    if t.status in {"WAITING_ON_USER", "RESOLVED"}:
        t.status = "OPEN"
        t.resolved_at = None
    t.version += 1
    await db.flush()
    await db.refresh(t)
    return TicketDetail(ticket=TicketOut.model_validate(t), messages=await _messages(db, t, False))


@router.post("/{ticket_id}/close", response_model=TicketOut)
async def close_own(
    ticket_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> SupportTicket:
    t = await _own_ticket(db, ticket_id, current_user)
    if t.status != "CLOSED":
        t.status = "CLOSED"
        t.resolved_at = t.resolved_at or _now()
        t.version += 1
        await db.flush()
        await db.refresh(t)
    return t


staff = require_role(UserRole.ADMIN)


@staff_router.get("", response_model=list[StaffTicketOut])
async def queue(
    response: Response,
    status_filter: str | None = Query(None, alias="status"),
    severity: str | None = None,
    assignee: str | None = Query(None, description="'me', 'none' or a user id"),
    overdue: bool = False,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
) -> list[StaffTicketOut]:
    q = select(SupportTicket, User.email).join(User, User.id == SupportTicket.requester_id)
    if status_filter == "active":
        q = q.where(SupportTicket.status.in_(OPEN_STATUSES))
    elif status_filter:
        q = q.where(SupportTicket.status == status_filter)
    if severity:
        q = q.where(SupportTicket.severity == severity)
    if assignee == "me":
        q = q.where(SupportTicket.assignee_id == admin.id)
    elif assignee == "none":
        q = q.where(SupportTicket.assignee_id.is_(None))
    elif assignee:
        try:
            q = q.where(SupportTicket.assignee_id == uuid.UUID(assignee))
        except ValueError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "assignee must be 'me', 'none' or a user id") from exc
    if overdue:
        q = q.where(
            SupportTicket.first_response_at.is_(None),
            SupportTicket.status.in_(OPEN_STATUSES),
            SupportTicket.sla_due_at < _now(),
        )
    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    response.headers["X-Total-Count"] = str(total or 0)
    rows = await db.execute(q.order_by(SupportTicket.sla_due_at, SupportTicket.id).offset(offset).limit(limit))
    return [_staff_out(t, email) for t, email in rows.all()]


async def _staff_ticket(db: AsyncSession, ticket_id: uuid.UUID) -> SupportTicket:
    t = await db.get(SupportTicket, ticket_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return t


async def _staff_detail(db: AsyncSession, t: SupportTicket) -> StaffTicketDetail:
    requester = await db.get(User, t.requester_id)
    return StaffTicketDetail(ticket=_staff_out(t, requester.email if requester else None), messages=await _messages(db, t, True))


@staff_router.get("/{ticket_id}", response_model=StaffTicketDetail)
async def staff_ticket(ticket_id: uuid.UUID, _: User = Depends(staff), db: AsyncSession = Depends(get_db)) -> StaffTicketDetail:
    return await _staff_detail(db, await _staff_ticket(db, ticket_id))


@staff_router.patch("/{ticket_id}", response_model=StaffTicketDetail)
async def staff_update(
    ticket_id: uuid.UUID,
    payload: StaffTicketUpdate,
    request: Request,
    admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
) -> StaffTicketDetail:
    t = await _staff_ticket(db, ticket_id)
    if t.version != payload.expected_version:
        raise HTTPException(status.HTTP_409_CONFLICT, "Someone else changed this ticket; reload and try again")
    changes: dict[str, object] = {}
    if payload.assignee_id is not None:
        assignee = await db.get(User, payload.assignee_id)
        if assignee is None or assignee.role != UserRole.ADMIN or not assignee.is_active:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Tickets can only be assigned to active staff")
        changes["assignee_id"] = str(payload.assignee_id)
        t.assignee_id = payload.assignee_id
    elif payload.unassign:
        changes["assignee_id"] = None
        t.assignee_id = None
    if payload.severity and payload.severity != t.severity:
        changes["severity"] = payload.severity
        t.severity = payload.severity
        if t.first_response_at is None:
            t.sla_due_at = (_aware(t.created_at) or _now()) + SLA[payload.severity]
    if payload.status and payload.status != t.status:
        changes["status"] = payload.status
        t.status = payload.status
        t.resolved_at = _now() if payload.status in {"RESOLVED", "CLOSED"} else None
        await notify_user(db, t.requester_id, "Support ticket updated", f"“{t.subject}” is now {payload.status.lower().replace('_', ' ')}.", "support")
    if not changes:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Nothing to change")
    t.version += 1
    await record_audit_event(
        db, "support.ticket.update", "support_ticket", str(t.id), admin.id, admin.role.value,
        {**changes, "reason": payload.reason}, request,
    )
    await db.flush()
    await db.refresh(t)
    return await _staff_detail(db, t)


@staff_router.post("/{ticket_id}/messages", response_model=StaffTicketDetail)
async def staff_reply(
    ticket_id: uuid.UUID,
    payload: StaffMessageCreate,
    admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
) -> StaffTicketDetail:
    t = await _staff_ticket(db, ticket_id)
    db.add(SupportMessage(ticket_id=t.id, author_id=admin.id, body=payload.body, internal=payload.internal))
    if not payload.internal:
        if t.first_response_at is None:
            t.first_response_at = _now()
        if t.status == "OPEN":
            t.status = "IN_PROGRESS"
        await notify_user(db, t.requester_id, "Support replied", f"There is a new reply on “{t.subject}”.", "support")
    t.version += 1
    await db.flush()
    await db.refresh(t)
    return await _staff_detail(db, t)
