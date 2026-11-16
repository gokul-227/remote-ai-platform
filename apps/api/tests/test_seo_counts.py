"""Hub eligibility must not fan out expensive salary/skills aggregation."""
import uuid

import pytest
from httpx import AsyncClient

from app.domains.jobs.models import JobPost
from app.domains.jobs.repository import JobRepository


@pytest.mark.asyncio
async def test_landing_count_filters_live_remote_jobs_without_details(client: AsyncClient, monkeypatch):
    from conftest import TestingSessionLocal

    keyword = f"countonly{uuid.uuid4().hex}"
    async with TestingSessionLocal() as db:
        for extra in ({}, {"is_active": False}, {"is_remote": False}):
            db.add(JobPost(
                title=keyword, slug=uuid.uuid4().hex, description="Fixture",
                company_name="Count fixture", source="ARBEITNOW", location="Berlin",
                **extra,
            ))
        await db.commit()

    async def details_forbidden(*args, **kwargs):
        raise AssertionError("hub eligibility must not compute full landing details")

    monkeypatch.setattr(JobRepository, "landing_stats", details_forbidden)
    result = await client.get("/api/v1/jobs/landing-count", params={"query": keyword, "location": "Berlin"})
    assert result.status_code == 200
    assert result.json() == {"total": 1}
    assert result.headers["cache-control"] == "public, max-age=1800"
    empty = await client.get("/api/v1/jobs/landing-count", params={"query": keyword, "location": "Missing"})
    assert empty.json() == {"total": 0}
    assert (await client.get("/api/v1/jobs/landing-count", params={"query": "x" * 101})).status_code == 422
