import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.domains.admin.models import ModerationReport
from app.domains.admin.repository import AdminRepository
from app.domains.auth.dependencies import get_current_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.jobs.models import JobPost
from app.domains.social.models import Post
from app.services.notifications import notify_user

router = APIRouter(prefix="/moderation", tags=["Moderation"])


class ModerationReportCreate(BaseModel):
    target_type: str = Field(pattern="^(USER|JOB|POST)$")
    target_id: uuid.UUID
    reason: str = Field(min_length=5, max_length=5000)


class ModerationDecision(BaseModel):
    status: str = Field(pattern="^(RESOLVED|DISMISSED)$")
    decision: str = Field(pattern="^(HIDE_JOB|SUSPEND_USER|REMOVE_POST|NO_ACTION)$")
    note: str | None = Field(default=None, max_length=5000)


@router.post("/reports", status_code=status.HTTP_201_CREATED)
async def create_report(
    data: ModerationReportCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.target_type == "USER":
        user_target = await db.get(User, data.target_id)
        if not user_target or user_target.id == current_user.id:
            raise HTTPException(status_code=404, detail="Report target not found")
    elif data.target_type == "POST":
        post_target = await db.get(Post, data.target_id)
        if not post_target or post_target.author_id == current_user.id:
            raise HTTPException(status_code=404, detail="Report target not found")
    else:
        job_target = await db.get(JobPost, data.target_id)
        if not job_target:
            raise HTTPException(status_code=404, detail="Report target not found")
    existing = await db.scalar(
        select(ModerationReport).where(
            ModerationReport.reporter_id == current_user.id,
            ModerationReport.target_type == data.target_type,
            ModerationReport.target_id == str(data.target_id),
            ModerationReport.status == "OPEN",
        )
    )
    if existing:
        raise HTTPException(
            status_code=409, detail="You already have an open report for this target"
        )
    report = ModerationReport(
        reporter_id=current_user.id,
        target_type=data.target_type,
        target_id=str(data.target_id),
        reason=data.reason,
    )
    db.add(report)
    await db.flush()
    return report


@router.get("/reports")
async def list_reports(
    current_user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)
):
    return (
        (await db.execute(select(ModerationReport).order_by(ModerationReport.created_at.desc())))
        .scalars()
        .all()
    )


@router.patch("/reports/{report_id}")
async def decide_report(
    report_id: uuid.UUID,
    data: ModerationDecision,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    report = await db.get(ModerationReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Moderation report not found")
    if report.status != "OPEN":
        raise HTTPException(status_code=409, detail="Moderation report is already closed")
    # Who to tell about the decision (never the reporter's identity or the
    # moderator's internal note), with what happened and how to appeal.
    owner_id: uuid.UUID | None = None
    what = ""
    if data.decision == "HIDE_JOB":
        if report.target_type != "JOB":
            raise HTTPException(status_code=422, detail="HIDE_JOB requires a job report")
        job_target = await db.get(JobPost, uuid.UUID(report.target_id))
        if not job_target:
            raise HTTPException(status_code=404, detail="Reported job no longer exists")
        job_target.is_active = False
        if job_target.company_id:
            owner_id = await db.scalar(
                select(CompanyProfile.user_id).where(CompanyProfile.id == job_target.company_id)
            )
            what = f"Your job post “{job_target.title}” was hidden"
    elif data.decision == "REMOVE_POST":
        if report.target_type != "POST":
            raise HTTPException(status_code=422, detail="REMOVE_POST requires a post report")
        post_target = await db.get(Post, uuid.UUID(report.target_id))
        if post_target:
            owner_id, what = post_target.author_id, "Your post was removed"
            await db.delete(post_target)
    elif data.decision == "SUSPEND_USER":
        if report.target_type != "USER":
            raise HTTPException(status_code=422, detail="SUSPEND_USER requires a user report")
        user_target = await db.get(User, uuid.UUID(report.target_id))
        if not user_target:
            raise HTTPException(status_code=404, detail="Reported user no longer exists")
        user_target.is_active = False
    report.status = data.status
    report.decision = data.decision
    report.decision_note = data.note
    report.reviewed_by_id = current_user.id
    report.resolved_at = datetime.utcnow()
    await AdminRepository(db).log_activity(
        current_user.id,
        "MODERATION_DECISION",
        report.target_type,
        report.target_id,
        {"report_id": str(report.id), "status": report.status, "decision": report.decision},
    )
    if owner_id is not None and owner_id != current_user.id:
        await notify_user(
            db,
            owner_id,
            "A moderator reviewed your content",
            f"{what} after a review under our acceptable use rules. If you think this was a mistake, "
            f"write to {settings.SUPPORT_EMAIL} to appeal.",
            "moderation",
        )
    await db.commit()
    await db.refresh(report)
    return report
