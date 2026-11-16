"""SEO landing pages, 410 availability and Indexing API prioritisation."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.domains.jobs.repository import employer_slug, salary_summary


async def _job(**kw) -> uuid.UUID:
    from conftest import TestingSessionLocal

    from app.domains.jobs.models import JobPost

    fields = {
        "title": "Python dev",
        "description": "d",
        "company_name": "Acme",
        "source": "ARBEITNOW",
    }
    fields.update(kw)
    async with TestingSessionLocal() as db:
        job = JobPost(slug=f"t-{uuid.uuid4().hex[:8]}", **fields)
        db.add(job)
        await db.commit()
        return job.id


def test_employer_slug_and_salary_summary():
    assert employer_slug("Acme, Inc.") == "acme-inc"
    assert salary_summary([]) is None
    rows = [(100, 200, "usd", "year"), (50, None, "USD", "year"), (10, 20, "EUR", "hour")]
    s = salary_summary(rows)
    assert s is not None
    assert s["currency"] == "USD"
    assert s["period"] == "year"
    assert s["count"] == 2
    assert s["low"] == 50
    assert s["high"] == 150


@pytest.mark.asyncio
async def test_landing_stats_and_employers(client: AsyncClient):
    await _job(salary_min=100, salary_max=200, currency="USD", salary_period="year")
    await _job(company_name="Beta Co")
    await _job(company_name="Acme", expired_at=datetime.now(UTC))
    r = await client.get("/api/v1/jobs/landing-stats?query=Python")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 2
    assert body["salary"]["currency"] == "USD"
    assert {c["name"] for c in body["top_companies"]} >= {"Acme", "Beta Co"}
    emps = (await client.get("/api/v1/jobs/employers")).json()
    assert any(e["slug"] == "beta-co" for e in emps)
    one = await client.get("/api/v1/jobs/employers/beta-co")
    assert one.status_code == 200
    assert one.json()["name"] == "Beta Co"
    assert (await client.get("/api/v1/jobs/employers/nobody-here")).status_code == 404
    listed = await client.get("/api/v1/jobs?employer=beta co")
    assert {j["company_name"] for j in listed.json()} == {"Beta Co"}


@pytest.mark.asyncio
async def test_availability_states(client: AsyncClient):
    now = datetime.now(UTC)
    live = await _job()
    recent = await _job(expired_at=now - timedelta(days=2))
    old = await _job(expired_at=now - timedelta(days=60))
    removed = await _job(is_deleted=True)
    ancient = await _job(posted_at=now - timedelta(days=200))

    async def state(i):
        return (await client.get(f"/api/v1/jobs/{i}/availability")).json()["state"]

    assert await state(live) == "live"
    assert await state(recent) == "expired"
    assert await state(old) == "gone"
    assert await state(removed) == "gone"
    assert await state(ancient) == "gone"
    assert (await client.get(f"/api/v1/jobs/{uuid.uuid4()}/availability")).status_code == 404


@pytest.mark.asyncio
async def test_indexable_newest_first_skips_noindex_sources():
    from conftest import TestingSessionLocal

    from app.domains.jobs.repository import JobRepository

    now = datetime.now(UTC)
    older = await _job(posted_at=now - timedelta(days=3))
    newer = await _job(posted_at=now - timedelta(hours=1))
    blocked = await _job(source="REMOTIVE")
    stale = await _job(posted_at=now - timedelta(days=120))
    async with TestingSessionLocal() as db:
        repo = JobRepository(db)
        assert await repo.indexable_newest_first([older, blocked, newer, stale]) == [newer, older]
        assert await repo.syndicated([blocked, older]) == [older]


@pytest.mark.asyncio
async def test_location_aliases_match_list_count_and_landing_stats(client: AsyncClient):
    usa = await _job(location="Remote, USA")
    spelled = await _job(location="Remote, United States")
    await _job(location="Canada")
    await _job(location="USA", expired_at=datetime.now(UTC))
    await _job(location="United States", is_deleted=True)
    params = {"location": " USA |united states|u.s."}
    listed = await client.get("/api/v1/jobs", params=params)
    assert listed.status_code == 200
    assert {j["id"] for j in listed.json()} == {str(usa), str(spelled)}
    assert int(listed.headers["x-total-count"]) == 2
    stats = await client.get("/api/v1/jobs/landing-stats", params=params)
    assert stats.status_code == 200
    assert stats.json()["total"] == 2
    single = await client.get("/api/v1/jobs", params={"location": "Canada"})
    assert len(single.json()) == 1
    assert single.json()[0]["location"] == "Canada"


@pytest.mark.asyncio
async def test_location_alias_validation_and_wildcards(client: AsyncClient):
    await _job(location="USA")
    await _job(location="Canada")
    for endpoint in ("/api/v1/jobs", "/api/v1/jobs/landing-stats"):
        assert (await client.get(endpoint, params={"location": "x" * 121})).status_code == 422
    listed = await client.get("/api/v1/jobs", params={"location": "%USA_|"})
    assert listed.status_code == 200
    assert [j["location"] for j in listed.json()] == ["USA"]
