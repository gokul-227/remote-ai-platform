import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.applications.models import JobApplication
from app.domains.jobs.models import JobPost
from app.domains.companies.models import CompanyProfile
from app.domains.network.router import notify

router = APIRouter(prefix="/applications", tags=["Applications"])


class ApplicationCreate(BaseModel):
    cover_note: Optional[str] = None


APPLICATION_STATUSES = {"APPLIED", "VIEWED", "SHORTLISTED", "INTERVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN", "INVITED"}


@router.get("/me")
async def list_applications(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(JobApplication, JobPost).join(JobPost, JobPost.id == JobApplication.job_id)
        .where(JobApplication.user_id == current_user.id).order_by(JobApplication.created_at.desc())
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
    existing = await db.scalar(select(JobApplication).where(JobApplication.user_id == current_user.id, JobApplication.job_id == job_id))
    if existing:
        raise HTTPException(status_code=409, detail="Application already exists")
    application = JobApplication(user_id=current_user.id, job_id=job_id, status="APPLIED", cover_note=data.cover_note)
    db.add(application)
    await db.flush()
    return application


@router.patch("/{application_id}/withdraw", status_code=status.HTTP_200_OK)
async def withdraw_application(application_id: uuid.UUID, current_user: User = Depends(require_role(UserRole.ENGINEER)), db: AsyncSession = Depends(get_db)):
    application = await db.get(JobApplication, application_id)
    if not application or application.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Application not found")
    application.status = "WITHDRAWN"
    await db.flush()
    return application


@router.get("/company")
async def list_company_applications(
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """List applications for jobs owned by the current company."""
    company = await db.scalar(select(CompanyProfile).where(CompanyProfile.user_id == current_user.id))
    if not company and current_user.role == UserRole.COMPANY:
        raise HTTPException(status_code=404, detail="Company profile required")
    query = select(JobApplication, JobPost).join(JobPost, JobPost.id == JobApplication.job_id)
    if company:
        query = query.where(JobPost.company_id == company.id)
    result = await db.execute(query.order_by(JobApplication.created_at.desc()))
    return [{"application": application, "job": job} for application, job in result.all()]


@router.post("/jobs/{job_id}/invite/{engineer_id}", status_code=status.HTTP_201_CREATED)
async def invite_engineer(
    job_id: uuid.UUID,
    engineer_id: uuid.UUID,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """Invite a freelancer to a company-owned job using the application workflow."""
    company = await db.scalar(select(CompanyProfile).where(CompanyProfile.user_id == current_user.id))
    job = await db.scalar(select(JobPost).where(JobPost.id == job_id, JobPost.company_id == company.id if company else True))
    if not job:
        raise HTTPException(status_code=404, detail="Company job not found")
    existing = await db.scalar(select(JobApplication).where(JobApplication.user_id == engineer_id, JobApplication.job_id == job_id))
    if existing:
        existing.status = "invited"
        return existing
    application = JobApplication(user_id=engineer_id, job_id=job_id, status="invited")
    db.add(application)
    await db.flush()
    return application


@router.patch("/{application_id}/status")
async def update_application_status(
    application_id: uuid.UUID,
    status_update: dict,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    next_status = str(status_update.get("status", "")).upper()
    if next_status not in APPLICATION_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unsupported application status: {next_status}")
    application = await db.get(JobApplication, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    company = await db.scalar(select(CompanyProfile).where(CompanyProfile.user_id == current_user.id))
    job = await db.get(JobPost, application.job_id)
    if current_user.role == UserRole.COMPANY and (not company or not job or job.company_id != company.id):
        raise HTTPException(status_code=403, detail="Application is not for your company")
    application.status = next_status
    await notify(db, application.user_id, "Application updated", f"Your application is now {next_status.lower()}.", "application_update")
    await db.flush()
    return application
