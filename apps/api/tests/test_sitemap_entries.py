"""SEO-01: the sitemap source covers every publicly listed job (not the first
100 remote ones) and carries no posting content."""

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient


async def _jobs(**overrides) -> list[uuid.UUID]:
    from conftest import TestingSessionLocal

    from app.domains.jobs.models import JobPost

    ids = []
    async with TestingSessionLocal() as db:
        for _ in range(overrides.pop("n", 1)):
            job = JobPost(title="T", slug=f"t-{uuid.uuid4().hex[:8]}", description="private-ish body",
                          company_name="C", source="ARBEITNOW", **overrides)
            db.add(job)
            await db.flush()
            ids.append(job.id)
        await db.commit()
    return ids


@pytest.mark.asyncio
async def test_includes_more_than_100_and_non_remote_jobs(client: AsyncClient):
    public = await _jobs(n=120) + await _jobs(is_remote=False)
    seen: set[str] = set()
    skip = 0
    while True:
        page = (await client.get(f"/api/v1/jobs/sitemap-entries?skip={skip}&limit=50")).json()
        seen |= {e["id"] for e in page}
        if len(page) < 50:
            break
        skip += 50
    assert {str(i) for i in public} <= seen


@pytest.mark.asyncio
async def test_excludes_hidden_expired_and_deleted_and_has_no_content(client: AsyncClient):
    hidden = await _jobs(is_active=False)
    expired = await _jobs(expired_at=datetime.now(UTC))
    deleted = await _jobs(is_deleted=True)
    await _jobs()
    resp = await client.get("/api/v1/jobs/sitemap-entries?limit=5000")
    assert resp.status_code == 200
    ids = {e["id"] for e in resp.json()}
    for i in hidden + expired + deleted:
        assert str(i) not in ids
    assert "private-ish body" not in resp.text
    assert set(resp.json()[0]) == {"id", "posted_at", "updated_at"}


@pytest.mark.asyncio
async def test_limit_is_bounded(client: AsyncClient):
    assert (await client.get("/api/v1/jobs/sitemap-entries?limit=5001")).status_code == 422


@pytest.mark.asyncio
async def test_deleted_job_is_not_in_the_public_list(client: AsyncClient):
    deleted = await _jobs(is_deleted=True)
    body = (await client.get("/api/v1/jobs?limit=100")).json()
    assert str(deleted[0]) not in {j["id"] for j in body}
