"""
API Router for Job Post domain.
"""

import hmac
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.domains.admin.repository import AdminRepository
from app.domains.auth.dependencies import get_optional_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile
from app.domains.jobs.models import JobPost
from app.domains.jobs.repository import JobRepository
from app.domains.jobs.schemas import (
    JobPostCreate,
    JobPostResponse,
    JobPostUpdate,
    JobSearchQuery,
    JobSitemapEntry,
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
    salary_currency: str | None = Query(
        None, pattern="^[A-Za-z]{3}$", description="ISO currency of min/max_salary (required with them)"
    ),
    salary_period: str | None = Query(
        None, pattern="^(hour|day|week|month|year)$", description="Period of min/max_salary (required with them)"
    ),
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
    if (min_salary is not None or max_salary is not None) and not (salary_currency and salary_period):
        # Amounts without units cannot be compared across hourly/yearly or
        # USD/EUR postings; refuse rather than guess (SEARCH-01).
        raise HTTPException(
            status_code=422,
            detail="min_salary/max_salary need salary_currency (e.g. USD) and salary_period (hour|day|week|month|year)",
        )
    if min_salary is not None and max_salary is not None and min_salary > max_salary:
        raise HTTPException(status_code=422, detail="min_salary is greater than max_salary")
    search_params = JobSearchQuery(
        query=query,
        is_remote=is_remote,
        job_type=job_type,
        experience_level=experience_level,
        min_salary=min_salary,
        max_salary=max_salary,
        salary_currency=salary_currency.upper() if salary_currency else None,
        salary_period=salary_period,
        skills=[skill.strip() for skill in skills or [] if skill.strip()] or None,
        source=source,
        company_id=company_id,
        skip=skip,
        limit=limit,
    )
    raw_jobs, total = await service.search_jobs_cached(search_params)
    response.headers["X-Total-Count"] = str(total)
    return [JobPostResponse.model_validate(j) for j in raw_jobs]


@router.get("/sitemap-entries", response_model=list[JobSitemapEntry])
async def list_sitemap_entries(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1, le=5000),
    db: AsyncSession = Depends(get_db),
) -> list[JobSitemapEntry]:
    """Every publicly listed job's id and dates, for the sitemap (SEO-01). The
    job list caps pages at 100 full postings; this returns small rows so the
    sitemap covers the whole public inventory cheaply. Public: the same jobs
    the anonymous list shows."""
    rows = await JobRepository(db).sitemap_entries(skip=skip, limit=limit)
    response.headers["Cache-Control"] = "public, max-age=900"
    return [JobSitemapEntry(id=i, posted_at=p, updated_at=u) for i, p, u in rows]


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
        .where(JobPost.company_id == company_id, JobPost.is_active.is_(True), JobPost.expired_at.is_(None))
        .order_by(JobPost.posted_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return [JobPostResponse.model_validate(job) for job in result.scalars().all()]


async def _owns_job(db: AsyncSession, job: JobPost, user: User | None) -> bool:
    if user is None or job.company_id is None:
        return False
    owner = await db.scalar(select(CompanyProfile.user_id).where(CompanyProfile.id == job.company_id))
    return owner == user.id


@router.get("/{job_id}", response_model=JobPostResponse)
async def get_job_by_id(
    job_id: uuid.UUID,
    service: JobService = Depends(get_job_service),
    current_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> JobPostResponse:
    """Get single job details by UUID.

    Closed, hidden (e.g. by moderation) and removed postings are visible only
    to their organisation and admins; everyone else gets 404.
    """
    job = await service.get_by_id(job_id)
    is_admin = current_user is not None and current_user.role == UserRole.ADMIN
    if job.is_deleted and not is_admin:
        raise HTTPException(status_code=404, detail="Job post not found")
    if not job.is_active and not is_admin and not await _owns_job(db, job, current_user):
        raise HTTPException(status_code=404, detail="Job post not found")
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


@router.post("/sync/scheduled", response_model=dict[str, int], include_in_schema=False)
async def scheduled_job_sync(
    x_job_sync_token: str | None = Header(default=None),
    service: JobService = Depends(get_job_service),
    db: AsyncSession = Depends(get_db),
) -> dict[str, int]:
    """The six-hourly sync (scheduled-job-sync.yml). Authorised by
    JOB_SYNC_TOKEN, which allows this and nothing else, so the workflow no
    longer needs an administrator's password."""
    expected = settings.JOB_SYNC_TOKEN
    if not expected:
        raise HTTPException(status_code=404, detail="Not found")
    if not x_job_sync_token or not hmac.compare_digest(x_job_sync_token.encode(), expected.encode()):
        raise HTTPException(status_code=403, detail="Forbidden")
    stats = await service.sync_all_job_sources(limit_per_source=30, admin_repo=AdminRepository(db))
    await db.commit()
    # Same six-hourly tick: retry Supabase user erasures that failed at
    # account deletion (DATA-04). There is no hosted worker to do it.
    from app.domains.auth.erasure import retry_pending_erasures  # auth -> engineers -> jobs cycle

    erasures = await retry_pending_erasures(db)
    # Backstop for the in-process email dispatcher (MAIL-01).
    from app.services.email.outbox import dispatch_due

    emails = await dispatch_due(db, limit=100)
    return {**stats, "identity_erasures_pending": erasures["pending"], "emails_sent": emails["sent"]}


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
