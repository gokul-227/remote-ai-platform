"""Scale paths (docs/operations/capacity.md): keyset paging of the public list,
the OFFSET cap, the employer read model and precomputed facets."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient


@pytest.fixture(autouse=True)
def _fresh_cache():
    from app.domains.jobs import list_cache

    list_cache.clear()
    yield
    list_cache.clear()


async def _seed(n: int) -> None:
    from conftest import TestingSessionLocal

    from app.domains.jobs.models import JobPost

    now = datetime.now(UTC)
    async with TestingSessionLocal() as db:
        for i in range(n):
            db.add(JobPost(title=f"Keyset role {i}", slug=f"k-{uuid.uuid4().hex[:8]}", description="d",
                           company_name="Keyset Co" if i % 2 else "Other Co", is_remote=True, skills=[],
                           source="REMOTEOK", posted_at=now - timedelta(minutes=i)))
        await db.commit()


@pytest.mark.asyncio
async def test_cursor_pages_match_offset_pages(client: AsyncClient):
    await _seed(7)
    first = await client.get("/api/v1/jobs", params={"limit": 3})
    assert first.status_code == 200
    cursor = first.headers["X-Next-Cursor"]
    by_cursor = await client.get("/api/v1/jobs", params={"limit": 3, "after": cursor})
    by_offset = await client.get("/api/v1/jobs", params={"limit": 3, "skip": 3})
    assert [j["id"] for j in by_cursor.json()] == [j["id"] for j in by_offset.json()]
    assert not {j["id"] for j in first.json()} & {j["id"] for j in by_cursor.json()}


@pytest.mark.asyncio
async def test_bad_cursor_is_ignored_and_deep_offset_is_refused(client: AsyncClient):
    from app.core.config import settings

    ok = await client.get("/api/v1/jobs", params={"limit": 3, "after": "not-a-cursor"})
    assert ok.status_code == 200
    deep = await client.get("/api/v1/jobs", params={"skip": settings.JOB_LIST_MAX_SKIP + 1})
    assert deep.status_code == 422


def test_cursor_round_trip():
    from app.domains.jobs.repository import job_cursor, parse_cursor

    ident = uuid.uuid4()
    ts = datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)
    assert parse_cursor(job_cursor({"posted_at": ts.isoformat(), "id": str(ident)})) == (ts, ident)
    assert parse_cursor("garbage") is None


@pytest.mark.asyncio
async def test_employer_read_model_serves_pages_after_refresh(db):
    from app.domains.jobs.repository import JobRepository

    await _seed(4)
    repo = JobRepository(db)
    live = await repo.employers(limit=10)
    assert {e["slug"] for e in live} >= {"keyset-co", "other-co"}
    assert await repo.refresh_employer_stats() >= 2
    stored = await repo.employers(limit=10)
    assert [(e["slug"], e["count"]) for e in stored][:2] == [(e["slug"], e["count"]) for e in live][:2]
    assert (await repo.employer_by_slug("keyset-co"))["name"] == "Keyset Co"
    assert await repo.employer_by_slug("nobody") is None


@pytest.mark.asyncio
async def test_stored_stats_expire(db):
    from app.domains.jobs.repository import JobRepository

    repo = JobRepository(db)
    await repo.store_stat("facets:x", {"total": 3, "facets": {}})
    assert (await repo.stored_stat("facets:x", timedelta(minutes=5)))["total"] == 3
    assert await repo.stored_stat("facets:x", timedelta(seconds=-1)) is None
    await repo.store_stat("facets:x", {"total": 4, "facets": {}})
    assert (await repo.stored_stat("facets:x", timedelta(minutes=5)))["total"] == 4


@pytest.mark.asyncio
async def test_stale_employer_model_falls_back_to_live(db):
    from sqlalchemy import update

    from app.domains.jobs.models import JobCatalogueStat
    from app.domains.jobs.repository import JobRepository

    await _seed(2)
    repo = JobRepository(db)
    await repo.refresh_employer_stats()
    await db.execute(update(JobCatalogueStat).values(computed_at=datetime.now(UTC) - timedelta(days=2)))
    await db.commit()
    assert not await repo._employer_stats_ready()
    assert (await repo.employer_by_slug("keyset-co"))["count"] == 1


@pytest.mark.asyncio
async def test_redis_failure_and_corrupt_values_are_cache_misses(monkeypatch):
    from app.domains.jobs import list_cache

    class BrokenRedis:
        async def get(self, key):
            return b"{invalid json"

        async def set(self, *args, **kwargs):
            raise ConnectionError("offline")

    monkeypatch.setattr(list_cache, "_shared", lambda: BrokenRedis())
    assert await list_cache.aget("corrupt") is None
    await list_cache.aput("local", {"total": 2})
    assert await list_cache.aget("local") == {"total": 2}
