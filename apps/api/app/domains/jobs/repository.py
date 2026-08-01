"""
Repository pattern for Job Post domain.
"""

import uuid
import re
from typing import Optional, List, Sequence
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.jobs.models import JobPost
from app.domains.jobs.schemas import JobPostCreate, JobPostUpdate


def slugify(text: str) -> str:
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_-]+", "-", slug)
    return slug[:200]


class JobRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, job_id: uuid.UUID) -> Optional[JobPost]:
        stmt = select(JobPost).where(JobPost.id == job_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_slug(self, slug: str) -> Optional[JobPost]:
        stmt = select(JobPost).where(JobPost.slug == slug)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_external_id(self, external_id: str) -> Optional[JobPost]:
        stmt = select(JobPost).where(JobPost.external_id == external_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, data: JobPostCreate) -> JobPost:
        base_slug = slugify(f"{data.title}-{data.company_name}")
        slug = f"{base_slug}-{uuid.uuid4().hex[:6]}"

        job = JobPost(
            company_id=data.company_id,
            title=data.title,
            slug=slug,
            description=data.description,
            company_name=data.company_name,
            company_logo=data.company_logo,
            location=data.location,
            is_remote=data.is_remote,
            job_type=data.job_type,
            experience_level=data.experience_level,
            salary_min=data.salary_min,
            salary_max=data.salary_max,
            currency=data.currency,
            skills=data.skills,
            external_id=data.external_id,
            external_url=data.external_url,
            source=data.source,
            is_active=True,
        )
        self.db.add(job)
        await self.db.flush()
        await self.db.refresh(job)
        return job

    async def upsert_external_job(self, data: JobPostCreate) -> JobPost:
        if not data.external_id:
            return await self.create(data)

        existing = await self.get_by_external_id(data.external_id)
        if existing:
            existing.title = data.title
            existing.description = data.description
            existing.company_name = data.company_name
            existing.company_logo = data.company_logo or existing.company_logo
            existing.location = data.location
            existing.is_remote = data.is_remote
            existing.skills = data.skills
            existing.external_url = data.external_url or existing.external_url
            if data.salary_min:
                existing.salary_min = data.salary_min
            if data.salary_max:
                existing.salary_max = data.salary_max
            await self.db.flush()
            return existing

        return await self.create(data)

    async def search(
        self,
        query: Optional[str] = None,
        skills: Optional[List[str]] = None,
        is_remote: Optional[bool] = None,
        job_type: Optional[str] = None,
        experience_level: Optional[str] = None,
        min_salary: Optional[float] = None,
        source: Optional[str] = None,
        skip: int = 0,
        limit: int = 20,
    ) -> Sequence[JobPost]:
        stmt = select(JobPost).where(JobPost.is_active == True)

        if is_remote is not None:
            stmt = stmt.where(JobPost.is_remote == is_remote)

        if job_type:
            stmt = stmt.where(func.lower(JobPost.job_type) == job_type.lower())

        if experience_level:
            stmt = stmt.where(func.lower(JobPost.experience_level) == experience_level.lower())

        if min_salary:
            stmt = stmt.where(
                or_(JobPost.salary_min >= min_salary, JobPost.salary_max >= min_salary)
            )

        if source:
            stmt = stmt.where(func.upper(JobPost.source) == source.upper())

        if query:
            q = f"%{query.lower()}%"
            stmt = stmt.where(
                or_(
                    func.lower(JobPost.title).like(q),
                    func.lower(JobPost.description).like(q),
                    func.lower(JobPost.company_name).like(q),
                )
            )

        stmt = stmt.offset(skip).limit(limit).order_by(JobPost.posted_at.desc())
        result = await self.db.execute(stmt)
        return result.scalars().all()
