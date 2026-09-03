from unittest.mock import AsyncMock

import pytest


@pytest.mark.asyncio
async def test_sync_all_job_sources_can_target_a_single_source():
    """Regression test: the Celery `sync_source(source)` task used to ignore its
    argument entirely and always sync every source. sync_all_job_sources now
    accepts an optional source_name filter that the task passes through."""
    from conftest import TestingSessionLocal

    from app.domains.jobs.repository import JobRepository
    from app.domains.jobs.service import JobService

    async with TestingSessionLocal() as db:
        service = JobService(JobRepository(db))
        for aggregator in service.aggregators:
            aggregator.fetch_jobs = AsyncMock(return_value=[])

        target = service.aggregators[1]
        stats = await service.sync_all_job_sources(
            limit_per_source=5, source_name=target.source_name
        )

        assert stats == {target.source_name: 0}
        target.fetch_jobs.assert_awaited_once()
        for other in service.aggregators:
            if other is not target:
                other.fetch_jobs.assert_not_awaited()


@pytest.mark.asyncio
async def test_sync_all_job_sources_unknown_source_name_is_a_noop():
    from conftest import TestingSessionLocal

    from app.domains.jobs.repository import JobRepository
    from app.domains.jobs.service import JobService

    async with TestingSessionLocal() as db:
        service = JobService(JobRepository(db))
        for aggregator in service.aggregators:
            aggregator.fetch_jobs = AsyncMock(return_value=[])

        stats = await service.sync_all_job_sources(limit_per_source=5, source_name="not-a-real-source")

        assert stats == {}
        for aggregator in service.aggregators:
            aggregator.fetch_jobs.assert_not_awaited()
