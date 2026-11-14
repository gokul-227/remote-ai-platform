"""Cross-domain operations oversight. Staff-only metadata; no private document/message bodies."""

import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.audit import record_audit_event
from app.core.database import get_db
from app.domains.auth.dependencies import require_role
from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.contracts.lifecycle import TERMINAL_CONTRACT_STATUSES
from app.domains.contracts.models import Contract
from app.domains.documents.models import Document
from app.domains.marketplace.models import ProjectTask
from app.domains.meetings.models import Meeting
from app.domains.notifications.models import EmailOutbox
from app.domains.projects.models import Project
from app.domains.support.models import SupportTicket

router = APIRouter(prefix="/admin/operations", tags=["Platform Operations"])
staff = require_role(UserRole.ADMIN)
DONE = ("done", "completed", "cancelled", "canceled")


@router.get("/summary")
async def operations_summary(
    _staff: User = Depends(staff), db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    """Measured workload across delivery, collaboration and service queues."""
    now = datetime.now(UTC)

    async def count(stmt: Any) -> int:
        return int(await db.scalar(stmt) or 0)

    open_tasks = select(func.count()).select_from(ProjectTask).join(Project).where(
        Project.is_deleted.is_(False), func.lower(ProjectTask.status).not_in(DONE)
    )
    return {
        "measured_at": now,
        "projects_by_status": dict((await db.execute(
            select(Project.status, func.count()).where(Project.is_deleted.is_(False)).group_by(Project.status)
        )).all()),
        "open_tasks": await count(open_tasks),
        "overdue_tasks": await count(open_tasks.where(ProjectTask.deadline < now)),
        "documents_by_kind": dict((await db.execute(
            select(Document.kind, func.count()).where(Document.is_deleted.is_(False)).group_by(Document.kind)
        )).all()),
        "upcoming_meetings": await count(select(func.count()).select_from(Meeting).where(
            Meeting.status == "SCHEDULED", Meeting.starts_at >= now
        )),
        "support_active": await count(select(func.count()).select_from(SupportTicket).where(
            SupportTicket.status.not_in(("RESOLVED", "CLOSED"))
        )),
        "email_pending": await count(select(func.count()).select_from(EmailOutbox).where(EmailOutbox.status == "PENDING")),
        "email_dead": await count(select(func.count()).select_from(EmailOutbox).where(EmailOutbox.status == "DEAD")),
    }


@router.get("/projects")
async def project_portfolio(
    response: Response,
    query: str = Query("", max_length=200),
    project_status: str | None = Query(None, max_length=30),
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    _staff: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    filters: list[ColumnElement[bool]] = [Project.is_deleted.is_(False)]
    if query.strip():
        filters.append(Project.title.icontains(query.strip(), autoescape=True))
    if project_status:
        filters.append(Project.status == project_status)
    response.headers["X-Total-Count"] = str(await db.scalar(
        select(func.count()).select_from(Project).where(*filters)
    ) or 0)
    rows = (await db.execute(
        select(Project, CompanyProfile.name).join(CompanyProfile, Project.company_id == CompanyProfile.id)
        .where(*filters).order_by(Project.created_at.desc(), Project.id).offset(skip).limit(limit)
    )).all()
    ids = [p.id for p, _ in rows]
    counts = dict((await db.execute(
        select(ProjectTask.project_id, func.count()).where(ProjectTask.project_id.in_(ids)).group_by(ProjectTask.project_id)
    )).all()) if ids else {}
    return [{
        "id": p.id, "title": p.title, "organisation": name, "status": p.status,
        "contract_id": p.contract_id, "task_count": counts.get(p.id, 0), "created_at": p.created_at,
    } for p, name in rows]


class ProjectOperationsUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    status: Literal["CREATED", "PLANNING", "ACTIVE", "REVIEW", "COMPLETED", "CANCELLED"]
    expected_status: str = Field(min_length=1, max_length=30)
    reason: str = Field(min_length=3, max_length=500)


@router.patch("/projects/{project_id}/status")
async def project_status_update(
    project_id: uuid.UUID, body: ProjectOperationsUpdate, request: Request,
    admin: User = Depends(staff), db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    project = await db.scalar(select(Project).where(
        Project.id == project_id, Project.is_deleted.is_(False)
    ).with_for_update().execution_options(populate_existing=True))
    if project is None:
        raise HTTPException(404, "Project not found")
    if project.status == body.status:
        return {"id": project.id, "status": project.status}
    if project.status != body.expected_status:
        raise HTTPException(409, "The project changed. Refresh before trying again.")
    if body.status == "CANCELLED":
        signed = await db.scalar(select(Contract.id).where(
            or_(Contract.id == project.contract_id, Contract.project_id == project.id),
            Contract.is_deleted.is_(False),
            or_(
                Contract.status.in_(("OFFERED", "SIGNED", "ACTIVE", "DISPUTED")),
                # A first signature freezes terms even while the contract is DRAFT.
                Contract.status.not_in(TERMINAL_CONTRACT_STATUSES)
                & or_(Contract.client_signed_at.is_not(None), Contract.worker_signed_at.is_not(None)),
            ),
        ).limit(1))
        if signed:
            raise HTTPException(409, "Resolve the linked contract through its lifecycle before cancelling this project.")
    previous = project.status
    project.status = body.status
    await record_audit_event(db, actor_id=admin.id, actor_role="ADMIN", action="admin.project.status",
                             resource_type="project", resource_id=str(project.id), request=request,
                             payload={"from": previous, "to": body.status, "reason": body.reason})
    await db.commit()
    return {"id": project.id, "status": project.status}
