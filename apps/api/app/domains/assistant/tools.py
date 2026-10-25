"""The assistant's typed tool registry.

Every tool runs as the signed-in user, through the same code paths and
permission checks as the regular API. Classes:

- READ: runs immediately, returns data the user could already fetch.
- DRAFT: returns text for the user to edit; writes nothing.
- WRITE: becomes a pending action that the user must confirm.

Anything not listed here (role changes, admin operations, payments, deletes) is
not reachable from the assistant at all.
"""

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, Response
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.applications.models import JobApplication
from app.domains.applications.router import ApplicationCreate, apply_to_job
from app.domains.auth.models import User, UserRole
from app.domains.channels.router import MessageIn, my_channels, post_message
from app.domains.contracts.models import Contract
from app.domains.jobs.models import JobPost
from app.domains.jobs.repository import JobRepository
from app.domains.jobs.router import list_jobs
from app.domains.jobs.service import JobService
from app.domains.marketplace.models import ProjectTask
from app.domains.meetings.router import list_my_meetings, schedule_meeting
from app.domains.meetings.schemas import MeetingCreate
from app.domains.projects.router import TaskCreate, create_task
from app.domains.support.router import open_ticket
from app.domains.support.schemas import TicketCreate

READ, DRAFT, WRITE = "READ", "DRAFT", "WRITE"


class _NoArgs(BaseModel):
    pass


class SearchJobsArgs(BaseModel):
    query: str = Field(min_length=1, max_length=100)


class DraftArgs(BaseModel):
    topic: str = Field(min_length=1, max_length=500)
    text: str = Field(min_length=1, max_length=5000)


class CreateTaskArgs(BaseModel):
    project_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    priority: str = "MEDIUM"


class ScheduleMeetingArgs(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    starts_at: datetime
    duration_minutes: int = Field(default=30, ge=5, le=480)
    participant_ids: list[uuid.UUID] = Field(min_length=1, max_length=25)


class SupportTicketArgs(BaseModel):
    subject: str = Field(min_length=3, max_length=255)
    category: str = "OTHER"
    body: str = Field(min_length=1, max_length=5000)


class ApplyArgs(BaseModel):
    job_id: uuid.UUID
    cover_note: str | None = Field(default=None, max_length=5000)


class ChannelPostArgs(BaseModel):
    channel_id: uuid.UUID
    body: str = Field(min_length=1, max_length=4000)


Runner = Callable[[BaseModel, User, AsyncSession], Awaitable[dict[str, Any]]]


@dataclass(frozen=True)
class Tool:
    name: str
    kind: str
    description: str
    args: type[BaseModel]
    run: Runner
    summarize: Callable[[BaseModel], str] = lambda a: ""


def _link(route: str) -> str:
    return f"#{route}"


async def _search_jobs(a: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    assert isinstance(a, SearchJobsArgs)
    jobs = await list_jobs(
        Response(), query=a.query, is_remote=True, job_type=None, experience_level=None,
        min_salary=None, max_salary=None, salary_currency=None, salary_period=None, skills=None,
        source=None, company_id=None, skip=0, limit=5, service=JobService(JobRepository(db)),
    )
    return {"items": [{"title": j.title, "company": j.company_name, "link": _link(f"jobdetail/{j.id}")} for j in jobs]}


async def _my_tasks(_: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    rows = await db.execute(
        select(ProjectTask).where(ProjectTask.assigned_user_id == user.id, ProjectTask.status != "COMPLETED")
        .order_by(ProjectTask.deadline.is_(None), ProjectTask.deadline).limit(10)
    )
    return {"items": [{"title": t.title, "status": t.status, "priority": t.priority, "link": _link("projects")} for t in rows.scalars()]}


async def _my_contracts(_: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    rows = await db.execute(
        select(Contract).where(
            (Contract.client_id == user.id) | (Contract.worker_id == user.id), Contract.is_deleted.is_(False)
        ).order_by(Contract.created_at.desc()).limit(10)
    )
    return {"items": [{"title": c.title, "status": c.status, "link": _link(f"contractsign/{c.id}")} for c in rows.scalars()]}


async def _my_meetings(_: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    meetings = await list_my_meetings(Response(), include_past=False, limit=10, offset=0, current_user=user, db=db)
    return {"items": [{"title": m.title, "starts_at": m.starts_at.isoformat(), "phase": m.phase, "link": _link("meetings")} for m in meetings]}


async def _my_applications(_: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    rows = await db.execute(
        select(JobApplication, JobPost).join(JobPost, JobPost.id == JobApplication.job_id)
        .where(JobApplication.user_id == user.id).order_by(JobApplication.updated_at.desc()).limit(10)
    )
    return {"items": [{"title": j.title, "company": j.company_name, "status": a.status, "link": _link("applications")} for a, j in rows.all()]}


async def _my_channels(_: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    chans = await my_channels(project_id=None, current_user=user, db=db)
    return {"items": [{"title": f"#{c.name}", "status": f"{c.unread} unread", "id": str(c.id), "link": _link("channels")} for c in chans[:15]]}


async def _apply(a: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    assert isinstance(a, ApplyArgs)
    # The endpoint's role dependency doesn't run on a direct call; enforce it here.
    if user.role != UserRole.ENGINEER:
        raise HTTPException(status_code=403, detail="Only professionals can apply to jobs")
    app_ = await apply_to_job(a.job_id, ApplicationCreate(cover_note=a.cover_note), current_user=user, db=db)
    return {"id": str(app_.id), "status": app_.status, "link": _link("applications")}


async def _post_channel(a: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    assert isinstance(a, ChannelPostArgs)
    msg = await post_message(a.channel_id, MessageIn(body=a.body), current_user=user, db=db)
    return {"id": str(msg.id), "link": _link("channels")}


async def _draft(a: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    assert isinstance(a, DraftArgs)
    return {"draft": a.text, "note": "Draft only — nothing was sent. Copy it where you want to use it."}


async def _create_task(a: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    assert isinstance(a, CreateTaskArgs)
    task = await create_task(
        TaskCreate(project_id=a.project_id, title=a.title, description=a.description, priority=a.priority),  # type: ignore[arg-type]
        current_user=user, db=db,
    )
    return {"id": str(task.id), "title": task.title, "link": _link("projects")}


async def _schedule_meeting(a: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    assert isinstance(a, ScheduleMeetingArgs)
    starts = a.starts_at if a.starts_at.tzinfo else a.starts_at.replace(tzinfo=UTC)
    m = await schedule_meeting(
        MeetingCreate(title=a.title, starts_at=starts, ends_at=starts + timedelta(minutes=a.duration_minutes),
                      participant_ids=a.participant_ids),
        current_user=user, db=db,
    )
    return {"id": str(m.id), "title": m.title, "starts_at": m.starts_at.isoformat(), "link": _link("meetings")}


async def _open_ticket(a: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    assert isinstance(a, SupportTicketArgs)
    detail = await open_ticket(TicketCreate(subject=a.subject, category=a.category, body=a.body), current_user=user, db=db)  # type: ignore[arg-type]
    return {"id": str(detail.ticket.id), "subject": detail.ticket.subject, "link": _link("support")}


TOOLS: dict[str, Tool] = {
    t.name: t
    for t in (
        Tool("search_jobs", READ, "Find open remote jobs by keyword.", SearchJobsArgs, _search_jobs),
        Tool("my_tasks", READ, "List my open work items.", _NoArgs, _my_tasks),
        Tool("my_contracts", READ, "List my contracts and their status.", _NoArgs, _my_contracts),
        Tool("my_meetings", READ, "List my upcoming meetings.", _NoArgs, _my_meetings),
        Tool("my_applications", READ, "List my job applications and their status.", _NoArgs, _my_applications),
        Tool("my_channels", READ, "List my channels with unread counts and their ids.", _NoArgs, _my_channels),
        Tool("draft_text", DRAFT, "Draft a message, proposal or profile text for the user to edit (never sent).", DraftArgs, _draft),
        Tool("create_task", WRITE, "Create a work item in a project the user belongs to.", CreateTaskArgs, _create_task,
             lambda a: f"Create work item “{a.title}”"),  # type: ignore[attr-defined]
        Tool("schedule_meeting", WRITE, "Schedule a meeting with people the user is connected to.", ScheduleMeetingArgs,
             _schedule_meeting, lambda a: f"Schedule “{a.title}” at {a.starts_at:%Y-%m-%d %H:%M} UTC"),  # type: ignore[attr-defined]
        Tool("apply_to_job", WRITE, "Apply to a job by id, with an optional cover note.", ApplyArgs, _apply,
             lambda a: f"Apply to job {a.job_id}"),  # type: ignore[attr-defined]
        Tool("post_to_channel", WRITE, "Post a message in one of my channels (by channel id).", ChannelPostArgs, _post_channel,
             lambda a: f"Post in the channel: “{a.body[:80]}”"),  # type: ignore[attr-defined]
        Tool("open_support_ticket", WRITE, "Open a support ticket for the user.", SupportTicketArgs, _open_ticket,
             lambda a: f"Open support ticket “{a.subject}”"),  # type: ignore[attr-defined]
    )
}


def catalog() -> list[dict[str, Any]]:
    return [
        {"name": t.name, "kind": t.kind, "description": t.description, "args": t.args.model_json_schema().get("properties", {})}
        for t in TOOLS.values()
    ]


def validate_args(tool: Tool, raw: object) -> BaseModel:
    if not isinstance(raw, dict):
        raw = {}
    try:
        return tool.args.model_validate(raw)
    except ValidationError as exc:
        raise ValueError(exc.errors()[0].get("msg", "invalid arguments")) from exc


async def execute(tool: Tool, args: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    """Run a tool as `user`; API errors become a user-readable failure, not a crash."""
    try:
        return {"ok": True, **(await tool.run(args, user, db))}
    except HTTPException as exc:
        return {"ok": False, "error": str(exc.detail)}
