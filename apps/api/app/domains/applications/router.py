import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.applications.models import JobApplication
from app.domains.auth.dependencies import get_current_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.engineers.models import EngineerProfile
from app.domains.jobs.models import JobPost
from app.domains.network.router import notify

router = APIRouter(prefix="/applications", tags=["Applications"])


class ApplicationCreate(BaseModel):
    cover_note: str | None = None


class ApplicationStatusUpdate(BaseModel):
    status: str


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
    if not await db.get(JobPost, job_id):
        raise HTTPException(status_code=404, detail="Job not found")
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
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    """List applications for jobs owned by the current company."""
    company = await db.scalar(
        select(CompanyProfile).where(CompanyProfile.user_id == current_user.id)
    )
    if not company and current_user.role == UserRole.COMPANY:
        raise HTTPException(status_code=404, detail="Company profile required")
    query = select(JobApplication, JobPost, User, EngineerProfile).join(
        JobPost, JobPost.id == JobApplication.job_id
    )
    if company:
        query = query.where(JobPost.company_id == company.id)
    result = await db.execute(
        query.join(User, User.id == JobApplication.user_id)
        .outerjoin(EngineerProfile, EngineerProfile.user_id == User.id)
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
                "full_name": user.full_name,
                "headline": profile.headline if profile else None,
                "primary_role": profile.primary_role if profile else None,
                "skills": profile.skills if profile else [],
                "years_of_experience": profile.years_of_experience if profile else 0,
                "profile_score": profile.profile_score if profile else None,
                "location": profile.location if profile else None,
            },
        }
        for application, job, user, profile in result.all()
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
        raise HTTPException(status_code=404, detail="Engineer not found")
    existing = await db.scalar(
        select(JobApplication).where(
            JobApplication.user_id == target_user_id, JobApplication.job_id == job_id
        )
    )
    if existing:
        existing.status = "INVITED"
        return existing
    application = JobApplication(user_id=target_user_id, job_id=job_id, status="INVITED")
    db.add(application)
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
