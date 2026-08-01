"""
Service layer for Job Post domain & Aggregator coordination.
"""

import asyncio
import uuid
from typing import Optional, List, Sequence, Dict

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.domains.jobs.aggregators.remoteok import RemoteOKAggregator
from app.domains.jobs.aggregators.arbeitnow import ArbeitnowAggregator
from app.domains.jobs.aggregators.remotive import RemotiveAggregator
from app.domains.jobs.aggregators.themuse import TheMuseAggregator
from app.domains.jobs.aggregators.usajobs import USAJobsAggregator
from app.domains.jobs.models import JobPost
from app.domains.jobs.repository import JobRepository
from app.domains.jobs.schemas import JobPostCreate, JobPostUpdate, JobSearchQuery

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
        return await self.repo.create(data)

    async def search_jobs(self, query: JobSearchQuery) -> Sequence[JobPost]:
        return await self.repo.search(
            query=query.query,
            skills=query.skills,
            is_remote=query.is_remote,
            job_type=query.job_type,
            experience_level=query.experience_level,
            min_salary=query.min_salary,
            source=query.source,
            skip=query.skip,
            limit=query.limit,
        )

    async def sync_all_job_sources(self, limit_per_source: int = 50) -> Dict[str, int]:
        """
        Runs job aggregation across all 5 public APIs, saving/upserting jobs to DB.
        """
        logger.info("Starting background job aggregation sync across 5 public APIs...")
        stats: Dict[str, int] = {}

        for aggregator in self.aggregators:
            try:
                fetched_jobs = await aggregator.fetch_jobs(limit=limit_per_source)
                count = 0
                for job_data in fetched_jobs:
                    await self.repo.upsert_external_job(job_data)
                    count += 1
                await self.repo.db.commit()
                stats[aggregator.source_name] = count
                logger.info(f"Aggregated {count} jobs from {aggregator.source_name}")
            except Exception as e:
                logger.error(f"Error aggregating jobs from {aggregator.source_name}: {e}")
                stats[aggregator.source_name] = 0

        return stats
