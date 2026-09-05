"""
Matching engine Celery tasks.
"""

import asyncio
import uuid

from celery import shared_task

from app.core.database import AsyncSessionFactory
from app.core.logging import get_logger
from app.domains.engineers.repository import EngineerRepository
from app.domains.jobs.repository import JobRepository
from app.domains.matching.service import MatchingService

logger = get_logger("workers.tasks.matching")


async def _async_compute_match(engineer_id_str: str, job_id_str: str):
    async with AsyncSessionFactory() as session:
        service = MatchingService(session)
        eng_repo = EngineerRepository(session)
        job_repo = JobRepository(session)

        eng = await eng_repo.get_by_id(uuid.UUID(engineer_id_str))
        job = await job_repo.get_by_id(uuid.UUID(job_id_str))

        if eng and job:
            match_res = await service.calculate_match(eng, job)
            await session.commit()
            logger.info(f"Match computed: score {match_res.overall_score}%")
            return match_res.overall_score
        return 0.0


async def _async_compute_engineer_recommendations(engineer_id_str: str):
    async with AsyncSessionFactory() as session:
        service = MatchingService(session)
        eng_repo = EngineerRepository(session)
        eng = await eng_repo.get_by_id(uuid.UUID(engineer_id_str))
        if eng:
            matches = await service.get_recommendations_for_engineer(eng.user_id)
            await session.commit()
            return len(matches)
        return 0


@shared_task(name="app.workers.tasks.matching.compute_match", queue="matching")
def compute_match(engineer_id: str, job_id: str):
    """Compute AI match score between an engineer and a job."""
    logger.info(f"Computing match between engineer {engineer_id} and job {job_id}")
    return asyncio.run(_async_compute_match(engineer_id, job_id))


@shared_task(name="app.workers.tasks.matching.compute_stale_matches", queue="matching")
def compute_stale_matches():
    """Recompute match scores for engineers with stale data.

    STUB: this does not identify or recompute anything real yet -- it only
    logs and returns a static "ok" status. No "staleness" concept is
    defined or queried, so match scores are never actually refreshed by
    this task. Once real stale-match logic is implemented here, gate it
    (and any UI implying match freshness is actively maintained) behind
    `is_feature_enabled("stale_match_recompute")` from
    app.core.feature_flags (backed by `FEATURE_STALE_MATCH_RECOMPUTE`,
    default False) so it ships dark until it's actually doing something.
    """
    logger.info("Recomputing stale matches...")
    return {"status": "ok"}


@shared_task(name="app.workers.tasks.matching.compute_engineer_recommendations", queue="matching")
def compute_engineer_recommendations(engineer_id: str):
    """Generate ranked job recommendations for an engineer."""
    logger.info(f"Generating recommendations for engineer {engineer_id}")
    return asyncio.run(_async_compute_engineer_recommendations(engineer_id))
