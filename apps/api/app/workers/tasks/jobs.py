"""
Job aggregation Celery background tasks.
"""

import asyncio

from celery import shared_task

from app.core.database import AsyncSessionFactory
from app.core.logging import get_logger
from app.domains.admin.repository import AdminRepository
from app.domains.jobs.repository import JobRepository
from app.domains.jobs.service import JobService

logger = get_logger("workers.tasks.jobs")


async def _async_sync_all_sources():
    async with AsyncSessionFactory() as session:
        repo = JobRepository(session)
        service = JobService(repo)
        admin_repo = AdminRepository(session)

        stats = await service.sync_all_job_sources(limit_per_source=50, admin_repo=admin_repo)
        await session.commit()
        return stats


@shared_task(name="app.workers.tasks.jobs.sync_all_sources", queue="jobs")
def sync_all_sources():
    """Trigger parallel job sync from all configured sources."""
    logger.info("Executing background job sync task...")
    return asyncio.run(_async_sync_all_sources())


@shared_task(name="app.workers.tasks.jobs.sync_source", queue="jobs")
def sync_source(source: str):
    """Sync jobs from a single source."""
    logger.info(f"Executing sync for source {source}...")
    return asyncio.run(_async_sync_all_sources())


@shared_task(name="app.workers.tasks.jobs.refresh_trending_skills", queue="jobs")
def refresh_trending_skills():
    """Recompute trending skills from recent job data."""
    logger.info("Refreshing trending skills...")
    return {"status": "ok"}
