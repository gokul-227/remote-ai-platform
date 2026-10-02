"""ING-01: a source that cannot be read is a failure, not an empty feed. Failures
are logged as FAILED and never expire that source's jobs; an unconfigured source
is DISABLED; a valid empty answer is a success that also skips expiry."""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.domains.jobs.aggregators.arbeitnow import ArbeitnowAggregator
from app.domains.jobs.aggregators.base import SourceDisabledError, SourceFetchError
from app.domains.jobs.aggregators.remoteok import RemoteOKAggregator
from app.domains.jobs.aggregators.remotive import RemotiveAggregator
from app.domains.jobs.aggregators.themuse import TheMuseAggregator
from app.domains.jobs.aggregators.usajobs import USAJobsAggregator


def _serve(monkeypatch, handler):
    real = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", factory)


ADAPTERS = [
    (ArbeitnowAggregator, {"data": []}),
    (RemoteOKAggregator, [{"legal": "notice"}]),
    (RemotiveAggregator, {"jobs": []}),
    (TheMuseAggregator, {"results": []}),
    (USAJobsAggregator, {"SearchResult": {"SearchResultItems": []}}),
]


@pytest.fixture(autouse=True)
def _usajobs_key(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "USAJOBS_AUTH_KEY", "test-key")


@pytest.mark.asyncio
@pytest.mark.parametrize("adapter,_", ADAPTERS)
async def test_non_200_is_a_failure_not_an_empty_feed(monkeypatch, adapter, _):
    _serve(monkeypatch, lambda req: httpx.Response(503, text="secret upstream body"))
    with pytest.raises(SourceFetchError) as exc:
        await adapter().fetch_jobs(limit=5)
    assert str(exc.value) == "HTTP 503"  # redacted: no response body


@pytest.mark.asyncio
@pytest.mark.parametrize("adapter,_", ADAPTERS)
async def test_malformed_json_and_wrong_shape_are_failures(monkeypatch, adapter, _):
    _serve(monkeypatch, lambda req: httpx.Response(200, text="<html>not json"))
    with pytest.raises(SourceFetchError):
        await adapter().fetch_jobs(limit=5)
    _serve(monkeypatch, lambda req: httpx.Response(200, json={"unexpected": 1}))
    with pytest.raises(SourceFetchError):
        await adapter().fetch_jobs(limit=5)


@pytest.mark.asyncio
@pytest.mark.parametrize("adapter,_", ADAPTERS)
async def test_timeout_is_a_failure(monkeypatch, adapter, _):
    def boom(req):
        raise httpx.ReadTimeout("timed out", request=req)

    _serve(monkeypatch, boom)
    with pytest.raises(SourceFetchError, match="ReadTimeout"):
        await adapter().fetch_jobs(limit=5)


@pytest.mark.asyncio
@pytest.mark.parametrize("adapter,empty", ADAPTERS)
async def test_valid_empty_feed_is_an_empty_list(monkeypatch, adapter, empty):
    _serve(monkeypatch, lambda req: httpx.Response(200, json=empty))
    assert await adapter().fetch_jobs(limit=5) == []


@pytest.mark.asyncio
async def test_usajobs_without_key_is_disabled(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "USAJOBS_AUTH_KEY", None)
    with pytest.raises(SourceDisabledError):
        await USAJobsAggregator().fetch_jobs(limit=5)


async def _stale_job(db, source: str) -> uuid.UUID:
    from app.domains.jobs.models import JobPost

    job = JobPost(
        title="Stale", slug=f"stale-{uuid.uuid4().hex[:8]}", description="d", company_name="C",
        source=source, external_id=f"{source.lower()}_{uuid.uuid4().hex[:8]}",
        last_seen_at=datetime.now(UTC) - timedelta(days=90),
    )
    db.add(job)
    await db.commit()
    return job.id


async def _sync_one(fetch: AsyncMock, source: str):
    from conftest import TestingSessionLocal
    from sqlalchemy import select

    from app.domains.admin.models import ApiSyncLog
    from app.domains.admin.repository import AdminRepository
    from app.domains.jobs.models import JobPost
    from app.domains.jobs.repository import JobRepository
    from app.domains.jobs.service import JobService

    async with TestingSessionLocal() as db:
        job_id = await _stale_job(db, source)
        service = JobService(JobRepository(db))
        target = next(a for a in service.aggregators if a.source_name == source)
        target.fetch_jobs = fetch
        await service.sync_all_job_sources(limit_per_source=5, admin_repo=AdminRepository(db), source_name=source)
    async with TestingSessionLocal() as db:
        job = await db.get(JobPost, job_id)
        log = (
            await db.execute(
                select(ApiSyncLog).where(ApiSyncLog.source == source).order_by(ApiSyncLog.created_at.desc())
            )
        ).scalars().first()
        return job, log


@pytest.mark.asyncio
async def test_failed_fetch_logs_failed_and_expires_nothing():
    job, log = await _sync_one(AsyncMock(side_effect=SourceFetchError("HTTP 500")), "ARBEITNOW")
    assert job.expired_at is None
    assert log.status == "FAILED" and log.error_message == "HTTP 500"


@pytest.mark.asyncio
async def test_unexpected_error_message_is_redacted_to_class_name():
    job, log = await _sync_one(AsyncMock(side_effect=RuntimeError("postgres://user:pw@host/db")), "REMOTIVE")
    assert job.expired_at is None
    assert log.status == "FAILED" and log.error_message == "RuntimeError"


@pytest.mark.asyncio
async def test_empty_feed_is_success_but_skips_expiry():
    job, log = await _sync_one(AsyncMock(return_value=[]), "THEMUSE")
    assert job.expired_at is None
    assert log.status == "SUCCESS" and log.jobs_fetched == 0


@pytest.mark.asyncio
async def test_disabled_source_is_recorded_as_disabled():
    job, log = await _sync_one(AsyncMock(side_effect=SourceDisabledError("no key")), "USAJOBS")
    assert job.expired_at is None
    assert log.status == "DISABLED"


@pytest.mark.asyncio
async def test_non_empty_success_still_expires_long_unseen_jobs():
    from app.domains.jobs.schemas import JobPostCreate

    fresh = JobPostCreate(
        title="Fresh", description="d", company_name="C", source="REMOTEOK",
        external_id=f"remoteok_{uuid.uuid4().hex[:8]}", job_type="unspecified", skills=[],
    )
    job, log = await _sync_one(AsyncMock(return_value=[fresh]), "REMOTEOK")
    assert job.expired_at is not None
    assert log.status == "SUCCESS" and log.jobs_fetched == 1
