"""
Repository pattern for Job Post domain.
"""

import re
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import Select, Text, cast, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
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

    async def get_by_id(self, job_id: uuid.UUID) -> JobPost | None:
        stmt = select(JobPost).where(JobPost.id == job_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_slug(self, slug: str) -> JobPost | None:
        stmt = select(JobPost).where(JobPost.slug == slug)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_external_id(self, external_id: str) -> JobPost | None:
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
            budget_min=data.budget_min,
            budget_max=data.budget_max,
            timeline=data.timeline,
            remote_preference=data.remote_preference,
            salary_min=data.salary_min,
            salary_max=data.salary_max,
            salary_period=data.salary_period,
            currency=data.currency,
            skills=data.skills,
            ai_analysis=data.ai_analysis,
            external_id=data.external_id,
            external_url=data.external_url,
            source=data.source,
            is_active=True,
        )
        self.db.add(job)
        await self.db.flush()
        await self.db.refresh(job)
        return job

    async def update(self, job_id: uuid.UUID, data: JobPostUpdate) -> JobPost | None:
        job = await self.get_by_id(job_id)
        if not job:
            return None
        updates = data.model_dump(exclude_unset=True)
        for field, value in updates.items():
            if field == "skills" and value is not None:
                job.skills = value
            elif hasattr(job, field):
                setattr(job, field, value)
        await self.db.flush()
        await self.db.refresh(job)
        return job

    async def upsert_external_job(self, data: JobPostCreate) -> tuple[JobPost, bool]:
        """Returns (job, created) where created=True if a new row was inserted."""
        if not data.external_id:
            return await self.create(data), True

        existing = await self.get_by_external_id(data.external_id)
        now = datetime.now(UTC)
        if existing:
            existing.last_seen_at = now
            existing.expired_at = None  # listed again by its source
            existing.title = data.title
            existing.description = data.description
            existing.company_name = data.company_name or existing.company_name
            existing.company_logo = data.company_logo or existing.company_logo
            existing.location = data.location
            existing.is_remote = data.is_remote
            existing.skills = data.skills
            existing.external_url = data.external_url or existing.external_url
            if data.salary_min:
                existing.salary_min = data.salary_min
            if data.salary_max:
                existing.salary_max = data.salary_max
            if data.salary_period:
                existing.salary_period = data.salary_period
            await self.db.flush()
            return existing, False

        job = await self.create(data)
        job.last_seen_at = now
        await self.db.flush()
        return job, True

    async def expire_unseen_jobs(self, source: str) -> int:
        """Take this source's imported jobs off the public list when no sync has
        seen them among the source's recent listings for JOB_UNSEEN_EXPIRY_DAYS
        (a freshness policy: they may still be open at the source). Called only
        after that source synced successfully; posted jobs never auto-expire."""
        cutoff = datetime.now(UTC) - timedelta(days=settings.JOB_UNSEEN_EXPIRY_DAYS)
        result = await self.db.execute(
            update(JobPost)
            .where(
                JobPost.source == source,
                JobPost.company_id.is_(None),
                JobPost.expired_at.is_(None),
                JobPost.last_seen_at < cutoff,
            )
            .values(expired_at=datetime.now(UTC))
        )
        return int(result.rowcount or 0)

    async def sitemap_entries(self, skip: int, limit: int) -> list[tuple[uuid.UUID, datetime, datetime]]:
        """id/posted/updated of every publicly listed job (any location), oldest
        first so pages stay stable while new jobs arrive."""
        stmt = self._filtered(select(JobPost.id, JobPost.posted_at, JobPost.updated_at))
        stmt = stmt.order_by(JobPost.posted_at.asc(), JobPost.id.asc()).offset(skip).limit(limit)
        return [(r[0], r[1], r[2]) for r in (await self.db.execute(stmt)).all()]

    def _filtered(
        self,
        stmt: Select,
        query: str | None = None,
        skills: list[str] | None = None,
        is_remote: bool | None = None,
        job_type: str | None = None,
        experience_level: str | None = None,
        min_salary: float | None = None,
        max_salary: float | None = None,
        salary_currency: str | None = None,
        salary_period: str | None = None,
        source: str | None = None,
        company_id: uuid.UUID | None = None,
    ) -> Select:
        stmt = stmt.where(
            JobPost.is_active.is_(True), JobPost.is_deleted.is_(False), JobPost.expired_at.is_(None)
        )

        if company_id is not None:
            stmt = stmt.where(JobPost.company_id == company_id)

        if is_remote is not None:
            stmt = stmt.where(JobPost.is_remote == is_remote)

        if job_type:
            stmt = stmt.where(func.lower(JobPost.job_type) == job_type.lower())

        if experience_level:
            stmt = stmt.where(func.lower(JobPost.experience_level) == experience_level.lower())

        # Salary bounds compare like with like (SEARCH-01): only jobs whose salary
        # is stated in the requested currency and period. A job with no stated
        # period or another currency is never treated as matching, and nothing
        # is converted or assumed to be USD per year.
        if min_salary is not None or max_salary is not None:
            stmt = stmt.where(
                func.upper(JobPost.currency) == (salary_currency or "").upper(),
                func.lower(JobPost.salary_period) == (salary_period or "").lower(),
            )

        if min_salary is not None:
            stmt = stmt.where(
                or_(JobPost.salary_min >= min_salary, JobPost.salary_max >= min_salary)
            )

        if max_salary is not None:
            stmt = stmt.where(
                or_(JobPost.salary_min <= max_salary, JobPost.salary_max <= max_salary)
            )

        if source:
            stmt = stmt.where(func.upper(JobPost.source) == source.upper())

        if query:
            dialect_name = self.db.get_bind().dialect.name
            if dialect_name == "postgresql":
                document = func.to_tsvector(
                    "simple",
                    func.concat_ws(
                        " ",
                        JobPost.title,
                        JobPost.description,
                        JobPost.company_name,
                        cast(JobPost.skills, Text),
                    ),
                )
                stmt = stmt.where(document.op("@@")(func.plainto_tsquery("simple", query)))
            else:
                keyword = f"%{query.strip()}%"
                stmt = stmt.where(
                    or_(
                        JobPost.title.ilike(keyword),
                        JobPost.description.ilike(keyword),
                        JobPost.company_name.ilike(keyword),
                        cast(JobPost.skills, Text).ilike(keyword),
                    )
                )

        if skills:
            skill_filters = [
                cast(JobPost.skills, Text).ilike(f'%"{skill.strip()}"%')
                for skill in skills
                if skill.strip()
            ]
            if skill_filters:
                stmt = stmt.where(or_(*skill_filters))

        return stmt

    async def search(
        self,
        query: str | None = None,
        skills: list[str] | None = None,
        is_remote: bool | None = None,
        job_type: str | None = None,
        experience_level: str | None = None,
        min_salary: float | None = None,
        max_salary: float | None = None,
        salary_currency: str | None = None,
        salary_period: str | None = None,
        source: str | None = None,
        company_id: uuid.UUID | None = None,
        skip: int = 0,
        limit: int = 20,
    ) -> Sequence[JobPost]:
        stmt = self._filtered(
            select(JobPost),
            query=query, skills=skills, is_remote=is_remote, job_type=job_type,
            experience_level=experience_level, min_salary=min_salary, max_salary=max_salary,
            salary_currency=salary_currency, salary_period=salary_period,
            source=source, company_id=company_id,
        )
        # id breaks ties so consecutive pages never overlap or skip rows.
        stmt = stmt.order_by(JobPost.posted_at.desc(), JobPost.id.desc()).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def count(self, **filters: Any) -> int:
        stmt = self._filtered(select(func.count()).select_from(JobPost), **filters)
        return int(await self.db.scalar(stmt) or 0)
