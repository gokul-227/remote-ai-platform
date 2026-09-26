"""Job search pagination (go-live finding O): totals and stable pages."""

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.jobs.models import JobPost


@pytest.mark.asyncio
async def test_job_search_reports_total_and_pages_do_not_overlap(client: AsyncClient, db: AsyncSession):
    same_time = datetime(2026, 9, 1, tzinfo=UTC)
    for i in range(55):
        db.add(JobPost(title=f"Role {i}", slug=f"role-{i}", description="d", company_name="Co", source="DIRECT", is_remote=True, posted_at=same_time))
    await db.commit()

    first = await client.get("/api/v1/jobs", params={"limit": 50})
    second = await client.get("/api/v1/jobs", params={"limit": 50, "skip": 50})
    assert first.headers["x-total-count"] == "55"
    assert len(first.json()) == 50
    assert len(second.json()) == 5
    ids = [j["id"] for j in first.json() + second.json()]
    assert len(set(ids)) == 55

    filtered = await client.get("/api/v1/jobs", params={"query": "Role 5", "limit": 5})
    assert int(filtered.headers["x-total-count"]) >= 1
