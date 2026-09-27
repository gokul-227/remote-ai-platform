"""Phase 06 ingestion: imported postings that their source stopped listing expire."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.domains.jobs.schemas import JobPostCreate


def _create(ext: str, source: str = "REMOTEOK") -> JobPostCreate:
    return JobPostCreate(
        title="Backend Engineer", description="Build things", company_name="Acme", is_remote=True,
        skills=["python"], source=source, external_id=ext, external_url=f"https://example.com/{ext}",
    )


async def _age(job_id, days: int):
    from conftest import TestingSessionLocal

    from app.domains.jobs.models import JobPost

    async with TestingSessionLocal() as db:
        job = await db.get(JobPost, job_id)
        job.last_seen_at = datetime.now(UTC) - timedelta(days=days)
        await db.commit()


@pytest.mark.asyncio
async def test_unseen_imported_jobs_expire_and_reappearing_ones_come_back(client: AsyncClient):
    from conftest import TestingSessionLocal

    from app.domains.jobs.models import JobPost
    from app.domains.jobs.repository import JobRepository

    tag = uuid.uuid4().hex[:8]
    async with TestingSessionLocal() as db:
        repo = JobRepository(db)
        stale, _ = await repo.upsert_external_job(_create(f"remoteok_stale_{tag}"))
        fresh, _ = await repo.upsert_external_job(_create(f"remoteok_fresh_{tag}"))
        other, _ = await repo.upsert_external_job(_create(f"remotive_old_{tag}", source="REMOTIVE"))
        await db.commit()
        ids = stale.id, fresh.id, other.id
    await _age(ids[0], 40)
    await _age(ids[2], 40)

    async with TestingSessionLocal() as db:
        expired = await JobRepository(db).expire_unseen_jobs("REMOTEOK")
        await db.commit()
        assert expired == 1
        assert (await db.get(JobPost, ids[0])).expired_at is not None
        assert (await db.get(JobPost, ids[1])).expired_at is None
        assert (await db.get(JobPost, ids[2])).expired_at is None  # other sources untouched

    listed = {j["id"] for j in (await client.get("/api/v1/jobs", params={"limit": 100})).json()}
    assert str(ids[0]) not in listed and str(ids[1]) in listed
    detail = await client.get(f"/api/v1/jobs/{ids[0]}")
    assert detail.status_code == 200 and detail.json()["expired_at"] is not None

    async with TestingSessionLocal() as db:  # listed again by its source
        await JobRepository(db).upsert_external_job(_create(f"remoteok_stale_{tag}"))
        await db.commit()
        assert (await db.get(JobPost, ids[0])).expired_at is None


@pytest.mark.asyncio
async def test_posted_jobs_never_auto_expire(client: AsyncClient):
    from conftest import TestingSessionLocal

    from app.domains.jobs.models import JobPost
    from app.domains.jobs.repository import JobRepository

    async with TestingSessionLocal() as db:
        job = JobPost(company_id=uuid.uuid4(), title="Direct role", slug=f"d-{uuid.uuid4().hex[:6]}",
                      description="x", company_name="Org", is_remote=True, skills=[], source="REMOTEOK",
                      last_seen_at=datetime.now(UTC) - timedelta(days=90))
        db.add(job)
        await db.commit()
        await JobRepository(db).expire_unseen_jobs("REMOTEOK")
        await db.commit()
        assert (await db.get(JobPost, job.id)).expired_at is None
