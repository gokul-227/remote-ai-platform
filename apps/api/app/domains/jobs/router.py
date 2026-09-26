"""
API Router for Job Post domain.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.admin.repository import AdminRepository
from app.domains.auth.dependencies import require_role
from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.jobs.models import JobPost
from app.domains.jobs.repository import JobRepository
from app.domains.jobs.schemas import (
    JobPostCreate,
    JobPostResponse,
    JobPostUpdate,
    JobSearchQuery,
)
from app.domains.jobs.service import JobService

router = APIRouter(prefix="/jobs", tags=["Job Posts"])


async def get_job_service(db: AsyncSession = Depends(get_db)) -> JobService:
    repo = JobRepository(db)
    return JobService(repo)


@router.get("", response_model=list[JobPostResponse])
async def list_jobs(
    response: Response,
    query: str | None = Query(None, description="Keywords search in title or description"),
    is_remote: bool = Query(True, description="Filter for remote jobs"),
    job_type: str | None = Query(None, description="full-time, contract, part-time"),
    experience_level: str | None = Query(None, description="junior, mid, senior, lead"),
    min_salary: float | None = Query(None, ge=0),
    max_salary: float | None = Query(None, ge=0),
    skills: list[str] | None = Query(None, description="Match any of these skills"),
    source: str | None = Query(None, description="Filter by source (REMOTEOK, ARBEITNOW, etc.)"),
    company_id: uuid.UUID | None = Query(None, description="Filter by company profile UUID"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    service: JobService = Depends(get_job_service),
) -> list[JobPostResponse]:
    """Search & filter active remote jobs aggregated from public APIs.

    The total number of matches is returned in the X-Total-Count header.
    """
    search_params = JobSearchQuery(
        query=query,
        is_remote=is_remote,
        job_type=job_type,
        experience_level=experience_level,
        min_salary=min_salary,
        max_salary=max_salary,
        skills=[skill.strip() for skill in skills or [] if skill.strip()] or None,
        source=source,
        company_id=company_id,
        skip=skip,
        limit=limit,
    )
    raw_jobs, total = await service.search_jobs_cached(search_params)
    response.headers["X-Total-Count"] = str(total)
    return [JobPostResponse.model_validate(j) for j in raw_jobs]


@router.get("/company", response_model=list[JobPostResponse])
async def list_company_jobs(
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    service: JobService = Depends(get_job_service),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> list[JobPostResponse]:
    company = await service.repo.db.scalar(
        select(CompanyProfile).where(CompanyProfile.user_id == current_user.id)
    )
    if not company and current_user.role == UserRole.COMPANY:
        raise HTTPException(status_code=404, detail="Company profile required")
    query = select(JobPost).order_by(JobPost.posted_at.desc())
    if company:
        query = query.where(JobPost.company_id == company.id)
    query = query.offset(skip).limit(limit)
    result = await service.repo.db.execute(query)
    return [JobPostResponse.model_validate(job) for job in result.scalars().all()]


@router.get("/company/{company_id}", response_model=list[JobPostResponse])
async def list_public_company_jobs(
    company_id: uuid.UUID,
    service: JobService = Depends(get_job_service),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> list[JobPostResponse]:
    """Get public job listings for a specific company profile (no auth required)."""
    result = await service.repo.db.execute(
        select(JobPost)
        .where(JobPost.company_id == company_id, JobPost.is_active.is_(True))
        .order_by(JobPost.posted_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return [JobPostResponse.model_validate(job) for job in result.scalars().all()]


@router.get("/{job_id}", response_model=JobPostResponse)
async def get_job_by_id(
    job_id: uuid.UUID,
    service: JobService = Depends(get_job_service),
) -> JobPostResponse:
    """Get single job details by UUID."""
    job = await service.get_by_id(job_id)
    return JobPostResponse.model_validate(job)


@router.patch("/{job_id}", response_model=JobPostResponse)
async def update_job(
    job_id: uuid.UUID,
    data: JobPostUpdate,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    service: JobService = Depends(get_job_service),
) -> JobPostResponse:
    """Update a job post (publish/unpublish, edit fields). COMPANY can only edit its own jobs."""
    existing = await service.get_by_id(job_id)
    if current_user.role == UserRole.COMPANY:
        if existing.company_id is None:
            raise HTTPException(
                status_code=403, detail="Aggregated jobs cannot be edited by a company"
            )
        company = await service.repo.db.scalar(
            select(CompanyProfile).where(CompanyProfile.user_id == current_user.id)
        )
        if not company or existing.company_id != company.id:
            raise HTTPException(status_code=403, detail="You can only edit your own company jobs")
    try:
        updated = await service.update_job(job_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return JobPostResponse.model_validate(updated)


@router.post("", response_model=JobPostResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    data: JobPostCreate,
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    service: JobService = Depends(get_job_service),
) -> JobPostResponse:
    """Post a new job (Requires COMPANY or ADMIN role)."""
    if current_user.role == UserRole.COMPANY:
        company = await service.repo.db.scalar(
            select(CompanyProfile).where(CompanyProfile.user_id == current_user.id)
        )
        if not company:
            raise HTTPException(status_code=404, detail="Company profile required")
        if data.company_id and data.company_id != company.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot post a job on behalf of another company",
            )
        data = data.model_copy(
            update={
                "company_id": company.id,
                "company_name": company.name,
                "company_logo": company.logo_url,
            }
        )
    try:
        job = await service.create_job(data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return JobPostResponse.model_validate(job)


@router.post("/sync", response_model=dict[str, int])
async def trigger_job_sync(
    limit_per_source: int = Query(30, ge=5, le=200),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    service: JobService = Depends(get_job_service),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    """Manually trigger a sync across all public job aggregators. Admin only —
    production also runs this every 6 hours from a scheduled GitHub Actions workflow."""
    admin_repo = AdminRepository(db)
    stats = await service.sync_all_job_sources(
        limit_per_source=limit_per_source, admin_repo=admin_repo
    )
    await db.commit()
    return stats
