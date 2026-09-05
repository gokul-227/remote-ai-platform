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


async def _async_sync_sources(source_name: str | None = None):
    async with AsyncSessionFactory() as session:
        repo = JobRepository(session)
        service = JobService(repo)
        admin_repo = AdminRepository(session)

        stats = await service.sync_all_job_sources(
            limit_per_source=50, admin_repo=admin_repo, source_name=source_name
        )
        await session.commit()
        return stats


@shared_task(name="app.workers.tasks.jobs.sync_all_sources", queue="jobs")
def sync_all_sources():
    """Trigger parallel job sync from all configured sources."""
    logger.info("Executing background job sync task...")
    return asyncio.run(_async_sync_sources())


@shared_task(name="app.workers.tasks.jobs.sync_source", queue="jobs")
def sync_source(source: str):
    """Sync jobs from a single source."""
    logger.info(f"Executing sync for source {source}...")
    return asyncio.run(_async_sync_sources(source_name=source))


@shared_task(name="app.workers.tasks.jobs.refresh_trending_skills", queue="jobs")
def refresh_trending_skills():
    """Recompute trending skills from recent job data.

    STUB: this does not compute anything real yet -- it only logs and
    returns a static "ok" status. No table/cache is populated, so nothing
    should read this task's output as live data. Once real trending-skills
    logic is implemented here, gate it (and any endpoint/UI that surfaces
    it) behind `is_feature_enabled("trending_skills")` from
    app.core.feature_flags (backed by `FEATURE_TRENDING_SKILLS`, default
    False) so it can be shipped dark and enabled deliberately, instead of a
    half-working feature going live the moment this function stops being a
    no-op.
    """
    logger.info("Refreshing trending skills...")
    return {"status": "ok"}
