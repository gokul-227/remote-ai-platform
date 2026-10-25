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
from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.domains.applications.models import JobApplication
from app.domains.applications.router import ApplicationCreate, apply_to_job
from app.domains.auth.models import User, UserRole
from app.domains.channels.router import MessageIn, my_channels, post_message
from app.domains.contracts.models import Contract
from app.domains.documents.router import DocumentCreate, create_document, list_documents
from app.domains.endorsements.router import EndorseIn, endorse
from app.domains.groups.models import Group, GroupMembership
from app.domains.jobs.models import JobPost
from app.domains.jobs.repository import JobRepository
from app.domains.jobs.router import list_jobs
from app.domains.jobs.service import JobService
from app.domains.marketplace.models import ProjectTask
from app.domains.matching.router import FREELANCE_TYPES
from app.domains.matching.service import MatchingService
from app.domains.meetings.router import list_my_meetings, schedule_meeting
from app.domains.meetings.schemas import MeetingCreate
from app.domains.network.models import Connection
from app.domains.network.router import ConnectionCreate, send_connection
from app.domains.notifications.models import Notification
from app.domains.projects.router import TaskCreate, create_task
from app.domains.saved_jobs.models import SavedJob
from app.domains.saved_jobs.router import save_job
from app.domains.social.router import create_post
from app.domains.social.schemas import PostCreate
from app.domains.support.models import SupportTicket
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


class CreateDocArgs(BaseModel):
    kind: str = Field(pattern="^(DOC|SHEET|SLIDES)$")
    title: str = Field(min_length=1, max_length=255)


# Every screen the assistant can take you to (route -> what it is).
SCREENS: dict[str, str] = {
    # Home and top bar
    "feed": "feed", "notifications": "notifications", "messenger": "chats", "search": "search",
    "assistant": "AI assistant",
    # Network
    "profile": "my profile", "network": "connections", "invitations": "connection invitations",
    "suggestions": "suggested connections", "engineers": "people directory", "companies": "company pages",
    "coprofile": "my company page",
    # Collaboration
    "channels": "channels", "groups": "communities", "meetings": "meetings", "calls": "calls",
    # Jobs
    "jobs": "job search", "recs": "AI-matched jobs", "saved": "saved jobs", "applications": "applications",
    "onboarding": "job preferences", "dash": "career insights", "postjob": "post a job",
    "cojobs": "manage job postings", "candidates": "applicants", "ride": "talent matching",
    # Freelancing
    "work": "browse freelance projects", "freelancework": "AI-matched freelance work",
    "taskmarket": "proposals and offers", "contracts": "contracts", "submissions": "deliverables",
    "worklog": "time and activity", "earnings": "payments", "reviews": "reviews and ratings",
    # Projects
    "workspace": "workspace", "projects": "boards", "backlog": "backlog and sprints", "timeline": "timeline",
    "docs": "documents", "sheets": "spreadsheets", "slides": "presentations", "files": "files",
    "repos": "repositories", "quality": "code review", "browser": "web browser",
    # Account
    "settings": "account settings", "security": "security and verification", "privacydata": "privacy and data",
    "apps": "connected apps", "help": "help center", "support": "support tickets",
}


class NavigateArgs(BaseModel):
    screen: str

    @field_validator("screen")
    @classmethod
    def _known(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in SCREENS:
            raise ValueError("unknown screen")
        return v


class PostArgs(BaseModel):
    content: str = Field(min_length=1, max_length=3000)
    visibility: str = Field(default="PUBLIC", pattern="^(PUBLIC|CONNECTIONS|PRIVATE)$")


class UserArgs(BaseModel):
    user_id: uuid.UUID


class JobArgs(BaseModel):
    job_id: uuid.UUID


class EndorseArgs(BaseModel):
    user_id: uuid.UUID
    skill: str = Field(min_length=1, max_length=100)


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
    if user.role == UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Staff accounts can't apply to jobs")
    app_ = await apply_to_job(a.job_id, ApplicationCreate(cover_note=a.cover_note), current_user=user, db=db)
    return {"id": str(app_.id), "status": app_.status, "link": _link("applications")}


async def _post_channel(a: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    assert isinstance(a, ChannelPostArgs)
    msg = await post_message(a.channel_id, MessageIn(body=a.body), current_user=user, db=db)
    return {"id": str(msg.id), "link": _link("channels")}


async def _freelance_recs(_: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    if user.role == UserRole.ADMIN:
        return {"items": []}
    try:
        matches = await MatchingService(db).get_recommendations_for_engineer(
            user.id, limit=8, job_types=FREELANCE_TYPES
        )
    except NotFoundError:
        return {"ok": False, "error": "Create your professional profile first"}
    return {"items": [
        {"title": m.job.title, "company": m.job.company_name, "status": f"{round(m.overall_score)}% match",
         "link": _link(f"jobdetail/{m.job.id}")}
        for m in matches if m.job
    ]}


async def _create_doc(a: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    assert isinstance(a, CreateDocArgs)
    doc = await create_document(DocumentCreate(kind=a.kind, title=a.title), current_user=user, db=db)  # type: ignore[arg-type]
    return {"id": str(doc.id), "title": doc.title, "link": _link("files")}


async def _navigate(a: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    assert isinstance(a, NavigateArgs)
    return {"items": [{"title": f"Open {SCREENS[a.screen]}", "link": _link(a.screen)}]}


async def _notifications(_: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    rows = await db.execute(
        select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(10)
    )
    return {"items": [{"title": n.title, "status": "new" if not n.is_read else "", "link": _link("notifications")} for n in rows.scalars()]}


async def _connections(_: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    rows = await db.execute(
        select(Connection).where(
            Connection.status == "ACCEPTED", (Connection.sender_id == user.id) | (Connection.receiver_id == user.id)
        ).limit(20)
    )
    ids = [c.receiver_id if c.sender_id == user.id else c.sender_id for c in rows.scalars()]
    people: list[User] = list((await db.execute(select(User).where(User.id.in_(ids)))).scalars()) if ids else []
    return {"items": [{"title": p.full_name or "Member", "id": str(p.id), "link": _link(f"engineer/{p.id}")} for p in people]}


async def _my_groups(_: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    rows = await db.execute(
        select(Group).join(GroupMembership, GroupMembership.group_id == Group.id)
        .where(GroupMembership.user_id == user.id).limit(20)
    )
    return {"items": [{"title": g.name, "link": _link(f"group/{g.id}")} for g in rows.scalars()]}


async def _my_files(_: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    docs = await list_documents(Response(), kind=None, project_id=None, contract_id=None, q=None, current_user=user, db=db)
    return {"items": [{"title": d.title, "status": d.kind.lower(), "link": _link("files")} for d in docs[:15]]}


async def _my_tickets(_: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    rows = await db.execute(
        select(SupportTicket).where(SupportTicket.requester_id == user.id).order_by(SupportTicket.updated_at.desc()).limit(10)
    )
    return {"items": [{"title": t.subject, "status": t.status, "link": _link("support")} for t in rows.scalars()]}


async def _saved_jobs(_: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    rows = await db.execute(
        select(JobPost).join(SavedJob, SavedJob.job_id == JobPost.id).where(SavedJob.user_id == user.id).limit(15)
    )
    return {"items": [{"title": j.title, "company": j.company_name, "link": _link(f"jobdetail/{j.id}")} for j in rows.scalars()]}


async def _post(a: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    assert isinstance(a, PostArgs)
    post = await create_post(PostCreate(content=a.content, visibility=a.visibility), current_user=user, db=db)
    return {"id": str(post.id), "link": _link("feed")}


async def _connect(a: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    assert isinstance(a, UserArgs)
    await send_connection(ConnectionCreate(receiver_id=a.user_id), current_user=user, db=db)
    return {"link": _link("network")}


async def _save_job(a: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    assert isinstance(a, JobArgs)
    await save_job(a.job_id, current_user=user, db=db)
    return {"link": _link("saved")}


async def _endorse(a: BaseModel, user: User, db: AsyncSession) -> dict[str, Any]:
    assert isinstance(a, EndorseArgs)
    await endorse(EndorseIn(user_id=a.user_id, skill=a.skill), current_user=user, db=db)
    return {"link": _link(f"engineer/{a.user_id}")}


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
        Tool("freelance_recommendations", READ, "Recommend freelance/contract work that fits my profile.", _NoArgs, _freelance_recs),
        Tool("open_screen", READ, "Take me to a screen. screen must be one of: " + ", ".join(SCREENS), NavigateArgs, _navigate),
        Tool("my_notifications", READ, "My latest notifications.", _NoArgs, _notifications),
        Tool("my_connections", READ, "People I'm connected with, with their ids.", _NoArgs, _connections),
        Tool("my_groups", READ, "Groups I belong to.", _NoArgs, _my_groups),
        Tool("my_files", READ, "My Docs, Sheets and Slides.", _NoArgs, _my_files),
        Tool("my_support_tickets", READ, "My support tickets and their status.", _NoArgs, _my_tickets),
        Tool("saved_jobs", READ, "Jobs I saved.", _NoArgs, _saved_jobs),
        Tool("draft_text", DRAFT, "Draft a message, proposal or profile text for the user to edit (never sent).", DraftArgs, _draft),
        Tool("create_task", WRITE, "Create a work item in a project the user belongs to.", CreateTaskArgs, _create_task,
             lambda a: f"Create work item “{a.title}”"),  # type: ignore[attr-defined]
        Tool("schedule_meeting", WRITE, "Schedule a meeting with people the user is connected to.", ScheduleMeetingArgs,
             _schedule_meeting, lambda a: f"Schedule “{a.title}” at {a.starts_at:%Y-%m-%d %H:%M} UTC"),  # type: ignore[attr-defined]
        Tool("apply_to_job", WRITE, "Apply to a job by id, with an optional cover note.", ApplyArgs, _apply,
             lambda a: f"Apply to job {a.job_id}"),  # type: ignore[attr-defined]
        Tool("post_to_channel", WRITE, "Post a message in one of my channels (by channel id).", ChannelPostArgs, _post_channel,
             lambda a: f"Post in the channel: “{a.body[:80]}”"),  # type: ignore[attr-defined]
        Tool("create_document", WRITE, "Create a Doc, Sheet or Slides file (kind DOC/SHEET/SLIDES) with a title.",
             CreateDocArgs, _create_doc, lambda a: f"Create {a.kind.lower()} “{a.title}”"),  # type: ignore[attr-defined]
        Tool("create_post", WRITE, "Publish a post on my feed (visibility PUBLIC, CONNECTIONS or PRIVATE).", PostArgs, _post,
             lambda a: f"Post: “{a.content[:80]}”"),  # type: ignore[attr-defined]
        Tool("send_connection_request", WRITE, "Send a connection request to a member by user id.", UserArgs, _connect,
             lambda a: "Send a connection request"),
        Tool("save_job", WRITE, "Save a job by id.", JobArgs, _save_job, lambda a: "Save this job"),
        Tool("endorse_skill", WRITE, "Endorse a connection for a skill on their profile.", EndorseArgs, _endorse,
             lambda a: f"Endorse them for {a.skill}"),  # type: ignore[attr-defined]
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
