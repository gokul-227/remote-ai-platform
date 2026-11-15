"""
API Router for Job Post domain.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.admin.repository import AdminRepository
from app.domains.auth.dependencies import get_optional_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.companies.access import resolve_company_for
from app.domains.companies.models import HIRING_ROLES, CompanyProfile
from app.domains.jobs.derive import (
    EMPLOYMENT_TYPES,
    INDUSTRIES,
    JOB_FUNCTIONS,
    LANGUAGES,
    REGIONS,
    SENIORITY_LEVELS,
    WORKPLACE_TYPES,
)
from app.domains.jobs.models import JobPost
from app.domains.jobs.repository import JobRepository
from app.domains.jobs.schemas import (
    JobFacets,
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


def _clean(values: list[str] | None, allowed: tuple[str, ...] | None = None) -> list[str] | None:
    out = [v.strip() for v in values or [] if v and v.strip()]
    if allowed is not None:
        bad = [v for v in out if v not in allowed]
        if bad:
            raise HTTPException(status_code=422, detail=f"Unknown filter value(s): {', '.join(bad)}")
    return out or None


def job_search_query(
    query: str | None = Query(
        None,
        max_length=200,
        description='Keywords in title, company or description. "exact phrase", -exclude, OR',
    ),
    is_remote: bool | None = Query(
        None, description="Legacy remote flag; defaults to remote-only unless `workplace` is set"
    ),
    workplace: list[str] | None = Query(None, description="remote | hybrid | onsite"),
    job_type: list[str] | None = Query(None, description=", ".join(EMPLOYMENT_TYPES)),
    experience_level: str | None = Query(None, description="Legacy: junior, mid, senior, lead"),
    seniority: list[str] | None = Query(None, description=", ".join(SENIORITY_LEVELS)),
    posted_within: str | None = Query(None, pattern="^(24h|3d|7d|30d|90d)$"),
    min_salary: float | None = Query(None, ge=0),
    max_salary: float | None = Query(None, ge=0),
    salary_currency: str | None = Query(
        None,
        pattern="^[A-Za-z]{3}$",
        description="ISO currency of min/max_salary (required with them)",
    ),
    salary_period: str | None = Query(
        None,
        pattern="^(hour|day|week|month|year)$",
        description="Period of min/max_salary (required with them)",
    ),
    has_salary: bool | None = Query(None, description="Only jobs that state a salary"),
    skills: list[str] | None = Query(None, description="Match any of these skills"),
    source: list[str] | None = Query(None, description="Job boards (REMOTEOK, DIRECT, ...)"),
    company_id: uuid.UUID | None = Query(None, description="Filter by company profile UUID"),
    company: list[str] | None = Query(None, description="Company names (any of)"),
    location: str | None = Query(
        None, max_length=60, description="Text in the posting's location (a city, e.g. Berlin)"
    ),
    country: list[str] | None = Query(None, description="ISO 3166-1 alpha-2 codes"),
    region: list[str] | None = Query(None, description=", ".join(REGIONS)),
    industry: list[str] | None = Query(None, description=", ".join(INDUSTRIES)),
    job_function: list[str] | None = Query(None, description=", ".join(JOB_FUNCTIONS)),
    language: list[str] | None = Query(
        None, description="Posting language: " + ", ".join(LANGUAGES)
    ),
    apply: str | None = Query(None, pattern="^(platform|external)$"),
    visa_sponsorship: bool | None = Query(None),
    tz: int | None = Query(
        None, ge=-12, le=14, description="Your UTC offset: jobs whose hours overlap within 3h"
    ),
    verified: bool | None = Query(None, description="Only verified companies"),
    sort: str = Query("recent", pattern="^(recent|relevant|salary)$"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> JobSearchQuery:
    if (min_salary is not None or max_salary is not None) and not (
        salary_currency and salary_period
    ):
        # Amounts without units cannot be compared across hourly/yearly or
        # USD/EUR postings; refuse rather than guess (SEARCH-01).
        raise HTTPException(
            status_code=422,
            detail="min_salary/max_salary need salary_currency (e.g. USD) and salary_period (hour|day|week|month|year)",
        )
    if min_salary is not None and max_salary is not None and min_salary > max_salary:
        raise HTTPException(status_code=422, detail="min_salary is greater than max_salary")
    places = _clean(workplace, WORKPLACE_TYPES)
    return JobSearchQuery(
        query=query.strip() if query and query.strip() else None,
        # Remote-only stays the default; an explicit workplace choice replaces it.
        is_remote=is_remote if is_remote is not None else (None if places else True),
        workplace=places,
        job_type=_clean([t.lower() for t in job_type or []], EMPLOYMENT_TYPES),
        experience_level=experience_level,
        seniority=_clean(seniority, SENIORITY_LEVELS),
        posted_within=posted_within,
        min_salary=min_salary,
        max_salary=max_salary,
        salary_currency=salary_currency.upper() if salary_currency else None,
        salary_period=salary_period,
        has_salary=has_salary or None,
        skills=_clean(skills),
        source=_clean(source),
        company_id=company_id,
        company=_clean(company),
        location=location,
        country=_clean([c.upper() for c in country or []]),
        region=_clean(region, REGIONS),
        industry=_clean(industry, INDUSTRIES),
        job_function=_clean(job_function, JOB_FUNCTIONS),
        language=_clean(language, LANGUAGES),
        apply=apply,
        visa_sponsorship=visa_sponsorship,
        tz=tz,
        verified=verified or None,
        sort=sort,
        skip=skip,
        limit=limit,
    )


@router.get("", response_model=list[JobPostResponse])
async def list_jobs(
    response: Response,
    search_params: JobSearchQuery = Depends(job_search_query),
    service: JobService = Depends(get_job_service),
) -> list[JobPostResponse]:
    """Search & filter active jobs (every filter of `job_search_query`).

    The total number of matches is returned in the X-Total-Count header.
    """
    raw_jobs, total = await service.search_jobs_cached(search_params)
    response.headers["X-Total-Count"] = str(total)
    return [JobPostResponse.model_validate(j) for j in raw_jobs]


@router.get("/facets", response_model=JobFacets)
async def job_facets(
    search_params: JobSearchQuery = Depends(job_search_query),
    service: JobService = Depends(get_job_service),
) -> JobFacets:
    """Counts per filter value for the current search. Each facet is counted
    with every other filter applied, so its own alternatives stay visible."""
    return JobFacets.model_validate(await service.facets_cached(search_params))


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
    company = await resolve_company_for(service.repo.db, current_user, HIRING_ROLES)
    if not company and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=404, detail="Create your organisation profile first")
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
        .where(
            JobPost.company_id == company_id,
            JobPost.is_active.is_(True),
            JobPost.expired_at.is_(None),
        )
        .order_by(JobPost.posted_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return [JobPostResponse.model_validate(job) for job in result.scalars().all()]


async def _owns_job(db: AsyncSession, job: JobPost, user: User | None) -> bool:
    if user is None or job.company_id is None:
        return False
    owner = await db.scalar(
        select(CompanyProfile.user_id).where(CompanyProfile.id == job.company_id)
    )
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
    if current_user.role != UserRole.ADMIN:
        if existing.company_id is None:
            raise HTTPException(
                status_code=403, detail="Aggregated jobs cannot be edited by a company"
            )
        company = await resolve_company_for(service.repo.db, current_user, HIRING_ROLES)
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
    """Post a new job (any member with an organisation profile, or an admin)."""
    if current_user.role != UserRole.ADMIN:
        company = await resolve_company_for(service.repo.db, current_user, HIRING_ROLES)
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
