import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.analytics.service import emit_analytics_event
from app.domains.applications.models import JobApplication
from app.domains.auth.dependencies import get_current_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.engineers.models import EngineerProfile
from app.domains.jobs.models import JobPost
from app.domains.matching.models import JobMatch
from app.domains.network.router import notify

router = APIRouter(prefix="/applications", tags=["Applications"])


class ApplicationCreate(BaseModel):
    cover_note: str | None = None


class ApplicationStatusUpdate(BaseModel):
    status: str


class InvitationResponse(BaseModel):
    accept: bool
    note: str | None = Field(None, max_length=2000)


APPLICATION_STATUSES = {
    "SUBMITTED",
    "REVIEWING",
    "SHORTLISTED",
    "REJECTED",
    "ACCEPTED",
    "WITHDRAWN",
    "INVITED",
    "APPLIED",
}
# Statuses an invitation may (re)open: not yet reviewed, or closed.
REINVITABLE_STATUSES = {"SUBMITTED", "APPLIED", "REJECTED", "WITHDRAWN"}
ALLOWED_TRANSITIONS = {
    "SUBMITTED": {"REVIEWING", "WITHDRAWN"},
    "APPLIED": {"REVIEWING", "WITHDRAWN"},  # Legacy status retained for existing rows.
    "REVIEWING": {"SHORTLISTED", "REJECTED", "WITHDRAWN"},
    "SHORTLISTED": {"ACCEPTED", "REJECTED", "WITHDRAWN"},
    "INVITED": {"REVIEWING", "ACCEPTED", "REJECTED", "WITHDRAWN"},
    "ACCEPTED": set(),
    "REJECTED": set(),
    "WITHDRAWN": set(),
}


@router.get("/me")
async def list_applications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    result = await db.execute(
        select(JobApplication, JobPost)
        .join(JobPost, JobPost.id == JobApplication.job_id)
        .where(JobApplication.user_id == current_user.id)
        .order_by(JobApplication.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return [{"application": application, "job": job} for application, job in result.all()]


@router.post("/jobs/{job_id}", status_code=status.HTTP_201_CREATED)
async def apply_to_job(
    job_id: uuid.UUID,
    data: ApplicationCreate,
    current_user: User = Depends(require_role(UserRole.ENGINEER)),
    db: AsyncSession = Depends(get_db),
):
    job = await db.get(JobPost, job_id)
    if not job or job.is_deleted:
        raise HTTPException(status_code=404, detail="Job not found")
    # Only a posting an organisation owns here has someone to review the
    # application. Imported listings are applied to on the source site;
    # accepting one here would tell the applicant it was sent to no one.
    if job.company_id is None:
        raise HTTPException(
            status_code=409,
            detail="This listing is imported from another job board. Apply on the source site.",
        )
    if not job.is_active:
        raise HTTPException(status_code=409, detail="This job is no longer accepting applications")
    existing = await db.scalar(
        select(JobApplication).where(
            JobApplication.user_id == current_user.id, JobApplication.job_id == job_id
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Application already exists")
    application = JobApplication(
        user_id=current_user.id, job_id=job_id, status="SUBMITTED", cover_note=data.cover_note
    )
    db.add(application)
    await db.flush()
    await emit_analytics_event(
        db, "application_submitted", current_user.id, {"job_id": str(job_id)}
    )
    return application


@router.patch("/{application_id}/withdraw", status_code=status.HTTP_200_OK)
async def withdraw_application(
    application_id: uuid.UUID,
    current_user: User = Depends(require_role(UserRole.ENGINEER)),
    db: AsyncSession = Depends(get_db),
):
    application = await db.get(JobApplication, application_id)
    if not application or application.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Application not found")
    if application.status not in {"SUBMITTED", "APPLIED", "REVIEWING", "SHORTLISTED", "INVITED"}:
        raise HTTPException(status_code=409, detail="Application can no longer be withdrawn")
    application.status = "WITHDRAWN"
    await db.flush()
    return application


@router.get("/company")
async def list_company_applications(
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
    job_id: uuid.UUID | None = Query(None, description="Only applications for this job"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    """List applications for jobs owned by the current company, with each
    candidate's AI match for that job when one has been computed."""
    company = await db.scalar(
        select(CompanyProfile).where(CompanyProfile.user_id == current_user.id)
    )
    if not company and current_user.role == UserRole.COMPANY:
        raise HTTPException(status_code=404, detail="Company profile required")
    query = select(JobApplication, JobPost, User, EngineerProfile, JobMatch).join(
        JobPost, JobPost.id == JobApplication.job_id
    )
    if company:
        query = query.where(JobPost.company_id == company.id)
    if job_id:
        query = query.where(JobPost.id == job_id)
    result = await db.execute(
        query.join(User, User.id == JobApplication.user_id)
        .outerjoin(EngineerProfile, EngineerProfile.user_id == User.id)
        .outerjoin(
            JobMatch,
            (JobMatch.engineer_id == EngineerProfile.id) & (JobMatch.job_id == JobPost.id),
        )
        .order_by(JobApplication.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return [
        {
            "application": application,
            "job": job,
            "candidate": {
                "id": str(user.id),
                "engineer_profile_id": str(profile.id) if profile else None,
                "full_name": user.full_name,
                "headline": profile.headline if profile else None,
                "primary_role": profile.primary_role if profile else None,
                "skills": profile.skills if profile else [],
                "years_of_experience": profile.years_of_experience if profile else 0,
                "location": profile.location if profile else None,
                "hourly_rate": profile.hourly_rate if profile else None,
            },
            "match": (
                {
                    "overall_score": match.overall_score,
                    "skill_score": match.skill_score,
                    "experience_score": match.experience_score,
                    "timezone_score": match.timezone_score,
                    "availability_score": match.availability_score,
                    "reasoning": match.reasoning,
                    "matching_skills": match.matching_skills,
                    "missing_skills": match.missing_skills,
                }
                if match
                else None
            ),
        }
        for application, job, user, profile, match in result.all()
    ]


@router.post("/jobs/{job_id}/invite/{engineer_id}", status_code=status.HTTP_201_CREATED)
async def invite_engineer(
    job_id: uuid.UUID,
    engineer_id: uuid.UUID,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Invite a freelancer to a company-owned job using the application workflow."""
    stmt = select(JobPost).where(JobPost.id == job_id)
    if current_user.role != UserRole.ADMIN:
        company = await db.scalar(
            select(CompanyProfile).where(CompanyProfile.user_id == current_user.id)
        )
        if not company:
            raise HTTPException(status_code=404, detail="Company profile not found")
        stmt = stmt.where(JobPost.company_id == company.id)
    job = await db.scalar(stmt)
    if not job:
        raise HTTPException(status_code=404, detail="Company job not found")
    engineer_profile = await db.get(EngineerProfile, engineer_id)
    target_user_id = engineer_profile.user_id if engineer_profile else engineer_id
    target_user = await db.get(User, target_user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="Professional not found")
    existing = await db.scalar(
        select(JobApplication).where(
            JobApplication.user_id == target_user_id, JobApplication.job_id == job_id
        )
    )
    if existing and existing.status not in REINVITABLE_STATUSES:
        # Already under review, shortlisted, accepted or invited — don't
        # silently reset the candidate's progress back to INVITED.
        return existing
    if existing:
        existing.status = "INVITED"
        application = existing
    else:
        application = JobApplication(user_id=target_user_id, job_id=job_id, status="INVITED")
        db.add(application)
    await notify(
        db,
        target_user_id,
        "You're invited to apply",
        f"{job.company_name or 'A company'} invited you to apply for {job.title}.",
        "application_invite",
    )
    await db.flush()
    return application


@router.patch("/{application_id}/respond")
async def respond_to_invitation(
    application_id: uuid.UUID,
    data: InvitationResponse,
    current_user: User = Depends(require_role(UserRole.ENGINEER)),
    db: AsyncSession = Depends(get_db),
):
    """Engineer accepts (moves into the company's review) or declines an invitation."""
    application = await db.get(JobApplication, application_id)
    if not application or application.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Application not found")
    if application.status != "INVITED":
        raise HTTPException(status_code=409, detail="Only open invitations can be answered")
    application.status = "REVIEWING" if data.accept else "WITHDRAWN"
    if data.accept and data.note:
        application.cover_note = data.note
    job = await db.get(JobPost, application.job_id)
    company = await db.get(CompanyProfile, job.company_id) if job and job.company_id else None
    if company:
        await notify(
            db,
            company.user_id,
            "Invitation accepted" if data.accept else "Invitation declined",
            f"{current_user.full_name} {'accepted' if data.accept else 'declined'} your invitation"
            f" for {job.title if job else 'your job'}.",
            "application_update",
        )
    await db.flush()
    return application


@router.patch("/{application_id}/status")
async def update_application_status(
    application_id: uuid.UUID,
    status_update: ApplicationStatusUpdate,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    next_status = status_update.status.upper()
    if next_status not in APPLICATION_STATUSES:
        raise HTTPException(
            status_code=422, detail=f"Unsupported application status: {next_status}"
        )
    application = await db.get(JobApplication, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    company = await db.scalar(
        select(CompanyProfile).where(CompanyProfile.user_id == current_user.id)
    )
    job = await db.get(JobPost, application.job_id)
    if current_user.role == UserRole.COMPANY and (
        not company or not job or job.company_id != company.id
    ):
        raise HTTPException(status_code=403, detail="Application is not for your company")
    current_status = application.status.upper()
    if next_status != current_status and next_status not in ALLOWED_TRANSITIONS.get(
        current_status, set()
    ):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot move application from {current_status} to {next_status}",
        )
    application.status = next_status
    await notify(
        db,
        application.user_id,
        "Application updated",
        f"Your application is now {next_status.lower()}.",
        "application_update",
    )
    await db.flush()
    return application
