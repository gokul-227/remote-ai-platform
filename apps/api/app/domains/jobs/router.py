"""
API Router for Job Post domain.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
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
    """Search & filter active remote jobs aggregated from public APIs."""
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
    raw_jobs = await service.search_jobs_cached(search_params)
    return [JobPostResponse.model_validate(j) for j in raw_jobs]


@router.get("/company", response_model=list[JobPostResponse])
async def list_company_jobs(
    current_user: User = Depends(require_role(UserRole.COMPANY, UserRole.ADMIN)),
    service: JobService = Depends(get_job_service),
) -> list[JobPostResponse]:
    company = await service.repo.db.scalar(
        select(CompanyProfile).where(CompanyProfile.user_id == current_user.id)
    )
    if not company and current_user.role == UserRole.COMPANY:
        raise HTTPException(status_code=404, detail="Company profile required")
    query = select(JobPost).order_by(JobPost.posted_at.desc())
    if company:
        query = query.where(JobPost.company_id == company.id)
    result = await service.repo.db.execute(query)
    return [JobPostResponse.model_validate(job) for job in result.scalars().all()]


@router.get("/company/{company_id}", response_model=list[JobPostResponse])
async def list_public_company_jobs(
    company_id: uuid.UUID,
    service: JobService = Depends(get_job_service),
) -> list[JobPostResponse]:
    """Get public job listings for a specific company profile (no auth required)."""
    result = await service.repo.db.execute(
        select(JobPost)
        .where(JobPost.company_id == company_id, JobPost.is_active.is_(True))
        .order_by(JobPost.posted_at.desc())
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
    """Manually trigger background sync across all 5 public job aggregators. Admin only —
    a scheduled sync already runs via Celery beat every 6 hours."""
    admin_repo = AdminRepository(db)
    stats = await service.sync_all_job_sources(
        limit_per_source=limit_per_source, admin_repo=admin_repo
    )
    await db.commit()
    return stats


DEMO_JOBS_SEED = [
    {
        "title": "Senior React & TypeScript Engineer",
        "company_name": "Stripe",
        "company_logo": "https://logo.clearbit.com/stripe.com",
        "location": "Worldwide Remote",
        "job_type": "full-time",
        "experience_level": "senior",
        "salary_min": 140000,
        "salary_max": 180000,
        "skills": ["React", "TypeScript", "Next.js", "GraphQL"],
        "source": "REMOTEOK",
        "description": "Build modern payments UI and frontend infrastructure for global developers.",
    },
    {
        "title": "Python Backend Architect (FastAPI / PostgreSQL)",
        "company_name": "Vercel",
        "company_logo": "https://logo.clearbit.com/vercel.com",
        "location": "US/Canada Remote",
        "job_type": "full-time",
        "experience_level": "lead",
        "salary_min": 160000,
        "salary_max": 210000,
        "skills": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker"],
        "source": "REMOTIVE",
        "description": "Architect high-concurrency API endpoints and backend microservices at scale.",
    },
    {
        "title": "AI / Machine Learning Infrastructure Engineer",
        "company_name": "Anthropic",
        "company_logo": "https://logo.clearbit.com/anthropic.com",
        "location": "Worldwide Remote",
        "job_type": "full-time",
        "experience_level": "senior",
        "salary_min": 180000,
        "salary_max": 250000,
        "skills": ["Python", "PyTorch", "LLM", "Vector DB", "Kubernetes"],
        "source": "DIRECT",
        "description": "Build high-performance ML pipelines, model serving platforms, and evaluation suites.",
    },
    {
        "title": "Staff DevOps Engineer (AWS & Terraform)",
        "company_name": "Datadog",
        "company_logo": "https://logo.clearbit.com/datadoghq.com",
        "location": "EMEA (Remote)",
        "job_type": "full-time",
        "experience_level": "lead",
        "salary_min": 150000,
        "salary_max": 190000,
        "skills": ["AWS", "Kubernetes", "Terraform", "Docker", "CI/CD"],
        "source": "ARBEITNOW",
        "description": "Scale multi-region Kubernetes clusters, infrastructure as code, and automated security pipelines.",
    },
    {
        "title": "Data Platform Engineer (Snowflake & Spark)",
        "company_name": "Supabase",
        "company_logo": "https://logo.clearbit.com/supabase.com",
        "location": "Worldwide Remote",
        "job_type": "full-time",
        "experience_level": "mid",
        "salary_min": 120000,
        "salary_max": 160000,
        "skills": ["Data Engineering", "Snowflake", "Spark", "Airflow", "Python"],
        "source": "THEMUSE",
        "description": "Design data lakes, ETL pipelines, and real-time analytics streaming infrastructure.",
    },
    {
        "title": "Full Stack Engineer (Next.js & Node.js)",
        "company_name": "Linear",
        "company_logo": "https://logo.clearbit.com/linear.app",
        "location": "Worldwide Remote",
        "job_type": "full-time",
        "experience_level": "senior",
        "salary_min": 135000,
        "salary_max": 175000,
        "skills": ["Next.js", "TypeScript", "Node.js", "TailwindCSS", "PostgreSQL"],
        "source": "REMOTEOK",
        "description": "Build blazingly fast issue tracking tools and real-time collaboration features.",
    },
    {
        "title": "Lead Go Systems Developer",
        "company_name": "Cloudflare",
        "company_logo": "https://logo.clearbit.com/cloudflare.com",
        "location": "Worldwide Remote",
        "job_type": "full-time",
        "experience_level": "lead",
        "salary_min": 170000,
        "salary_max": 220000,
        "skills": ["Go", "Microservices", "gRPC", "Kafka", "PostgreSQL"],
        "source": "DIRECT",
        "description": "Develop low-latency edge computing services, networking proxies, and security filters in Go.",
    },
    {
        "title": "Rust Distributed Systems Engineer",
        "company_name": "Postman",
        "company_logo": "https://logo.clearbit.com/postman.com",
        "location": "Americas (Remote)",
        "job_type": "full-time",
        "experience_level": "senior",
        "salary_min": 160000,
        "salary_max": 200000,
        "skills": ["Rust", "Distributed Systems", "WebAssembly", "C++"],
        "source": "REMOTIVE",
        "description": "Build high-throughput network engine components and memory-safe system utilities.",
    },
    {
        "title": "AI Agent & LLM Applications Developer",
        "company_name": "OpenAI",
        "company_logo": "https://logo.clearbit.com/openai.com",
        "location": "Worldwide Remote",
        "job_type": "contract",
        "experience_level": "senior",
        "salary_min": 175000,
        "salary_max": 230000,
        "skills": ["Python", "LLM", "LangChain", "Vector DB", "React"],
        "source": "DIRECT",
        "description": "Create next-gen autonomous AI agents, tool-use interfaces, and RAG search pipelines.",
    },
    {
        "title": "Senior GraphQL API Architect",
        "company_name": "Retool",
        "company_logo": "https://logo.clearbit.com/retool.com",
        "location": "US/Canada Remote",
        "job_type": "full-time",
        "experience_level": "senior",
        "salary_min": 145000,
        "salary_max": 185000,
        "skills": ["GraphQL", "TypeScript", "Node.js", "PostgreSQL", "React"],
        "source": "ARBEITNOW",
        "description": "Unify microservice schemas into a performant, federated GraphQL API platform.",
    },
]


@router.post("/seed_demo", response_model=dict[str, int])
async def seed_demo_jobs(
    service: JobService = Depends(get_job_service),
) -> dict[str, int]:
    """Seed 50 realistic software engineering remote jobs into the database.
    Disabled in production — demo/local-dev convenience only."""
    if settings.is_production:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Demo seeding is disabled in production"
        )
    created_count = 0
    for idx, item in enumerate(DEMO_JOBS_SEED):
        for sub_idx in range(5):  # Create variations to make 50 jobs
            raw_sal_min = item.get("salary_min")
            sal_min = (
                float(str(raw_sal_min)) + (sub_idx * 5000) if raw_sal_min is not None else None
            )
            raw_sal_max = item.get("salary_max")
            sal_max = (
                float(str(raw_sal_max)) + (sub_idx * 5000) if raw_sal_max is not None else None
            )
            job_data = JobPostCreate(
                title=f"{item['title']}"
                if sub_idx == 0
                else f"{item['title']} ({['Core Team', 'Platform', 'Growth', 'Infrastructure', 'Apps'][sub_idx]})",
                description=str(item["description"]),
                company_name=str(item["company_name"]),
                company_logo=str(item["company_logo"]) if item.get("company_logo") else None,
                location=str(item["location"]) if item.get("location") else "Remote",
                is_remote=True,
                job_type=str(item.get("job_type", "full-time")),
                experience_level=str(item["experience_level"])
                if item.get("experience_level")
                else "mid",
                salary_min=sal_min,
                salary_max=sal_max,
                currency="USD",
                skills=list(item.get("skills", [])),  # type: ignore
                source=str(item.get("source", "DIRECT")),
                external_id=f"demo-{idx}-{sub_idx}",
                external_url=f"https://remoteaiplatform.ai/jobs/demo-{idx}-{sub_idx}",
            )
            try:
                await service.create_job(job_data)
                created_count += 1
            except Exception:
                pass
    return {"created": created_count}
