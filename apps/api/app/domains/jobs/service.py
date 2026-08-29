"""
Service layer for Job Post domain & Aggregator coordination.
"""

import hashlib
import json
import time
import uuid
from collections.abc import Sequence

from app.agents.job_enricher import JobEnricherAgent
from app.core.cache import RedisCache
from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.domains.admin.repository import AdminRepository
from app.domains.jobs.aggregators.arbeitnow import ArbeitnowAggregator
from app.domains.jobs.aggregators.remoteok import RemoteOKAggregator
from app.domains.jobs.aggregators.remotive import RemotiveAggregator
from app.domains.jobs.aggregators.themuse import TheMuseAggregator
from app.domains.jobs.aggregators.usajobs import USAJobsAggregator
from app.domains.jobs.models import JobPost
from app.domains.jobs.repository import JobRepository
from app.domains.jobs.schemas import JobPostCreate, JobPostResponse, JobPostUpdate, JobSearchQuery
from app.domains.marketplace.models import AIReport

logger = get_logger("jobs.service")


class JobService:
    def __init__(self, repo: JobRepository):
        self.repo = repo
        self.aggregators = [
            RemoteOKAggregator(),
            ArbeitnowAggregator(),
            RemotiveAggregator(),
            TheMuseAggregator(),
            USAJobsAggregator(),
        ]
        self.cache = RedisCache("jobs")

    async def get_by_id(self, job_id: uuid.UUID) -> JobPost:
        job = await self.repo.get_by_id(job_id)
        if not job:
            raise NotFoundError("Job post not found")
        return job

    async def get_by_slug(self, slug: str) -> JobPost:
        job = await self.repo.get_by_slug(slug)
        if not job:
            raise NotFoundError("Job post not found")
        return job

    async def create_job(self, data: JobPostCreate) -> JobPost:
        if not data.company_name:
            raise ValueError("company_name is required to create a job post")
        job = await self.repo.create(data)
        analysis = await JobEnricherAgent().enrich_job(job.title, job.description)
        job.ai_analysis = {
            "improved_description": analysis.get("summary", job.description),
            "required_skills": analysis.get("skills", []),
            "technology_stack": analysis.get("tech_stack", []),
            "difficulty_level": analysis.get("experience_level", job.experience_level),
            "estimated_timeline": analysis.get("estimated_timeline"),
            "milestones": analysis.get("milestones", []),
            "tasks": analysis.get("tasks", []),
        }
        self.repo.db.add(
            AIReport(job_id=job.id, report_type="job_analysis", payload=job.ai_analysis)
        )
        await self.repo.db.flush()
        await self.repo.db.refresh(job)
        return job

    async def update_job(self, job_id: uuid.UUID, data: JobPostUpdate) -> JobPost:
        job = await self.repo.update(job_id, data)
        if not job:
            raise NotFoundError("Job post not found")
        return job

    async def search_jobs(self, query: JobSearchQuery) -> Sequence[JobPost]:
        return await self.repo.search(
            query=query.query,
            skills=query.skills,
            is_remote=query.is_remote,
            job_type=query.job_type,
            experience_level=query.experience_level,
            min_salary=query.min_salary,
            max_salary=query.max_salary,
            source=query.source,
            company_id=query.company_id,
            skip=query.skip,
            limit=query.limit,
        )

    async def search_jobs_cached(self, query: JobSearchQuery) -> list[dict]:
        payload = query.model_dump(mode="json")
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        cache_key = f"search:{digest}"
        cached = await self.cache.get_json(cache_key)
        if cached is not None:
            return cached
        jobs = await self.search_jobs(query)
        serialized = [JobPostResponse.model_validate(job).model_dump(mode="json") for job in jobs]
        await self.cache.set_json(cache_key, serialized, ttl_seconds=30)
        return serialized

    async def sync_all_job_sources(
        self, limit_per_source: int = 50, admin_repo: AdminRepository | None = None
    ) -> dict[str, int]:
        """
        Runs job aggregation across all 5 public APIs, saving/upserting jobs to DB.
        If `admin_repo` is given, records a per-source ApiSyncLog entry (fetched/inserted/
        updated/status/duration) so the admin status page reflects every sync run.
        """
        logger.info("Starting background job aggregation sync across 5 public APIs...")
        stats: dict[str, int] = {}

        for aggregator in self.aggregators:
            started = time.monotonic()
            try:
                fetched_jobs = await aggregator.fetch_jobs(limit=limit_per_source)
                inserted = updated = 0
                for job_data in fetched_jobs:
                    _, created = await self.repo.upsert_external_job(job_data)
                    inserted += int(created)
                    updated += int(not created)
                await self.repo.db.commit()
                stats[aggregator.source_name] = inserted + updated
                logger.info(
                    f"Aggregated {aggregator.source_name}: {inserted} new, {updated} updated"
                )
                if admin_repo:
                    await admin_repo.log_sync(
                        source=aggregator.source_name,
                        jobs_fetched=len(fetched_jobs),
                        jobs_inserted=inserted,
                        jobs_updated=updated,
                        status="SUCCESS",
                        duration_ms=int((time.monotonic() - started) * 1000),
                    )
            except Exception as e:
                logger.error(f"Error aggregating jobs from {aggregator.source_name}: {e}")
                stats[aggregator.source_name] = 0
                if admin_repo:
                    await admin_repo.log_sync(
                        source=aggregator.source_name,
                        jobs_fetched=0,
                        jobs_inserted=0,
                        jobs_updated=0,
                        status="FAILED",
                        error_message=str(e),
                        duration_ms=int((time.monotonic() - started) * 1000),
                    )

        if admin_repo:
            await admin_repo.db.commit()
        return stats
