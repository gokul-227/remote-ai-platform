"""Phase 02: an in-platform application is only accepted where someone can act on it.

Imported listings (no owning organisation here) are applied to on the source
site; recording an internal "SUBMITTED" application for them would tell the
applicant it was sent when no one will ever see it. Closed or removed postings
cannot be applied to either.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select


async def _engineer(client: AsyncClient) -> dict:
    tag = uuid.uuid4().hex[:8]
    reg = await client.post("/api/v1/auth/register", json={
        "email": f"applicant-{tag}@example.com", "password": "secure-pass",
        "full_name": "Applicant", "role": "ENGINEER",
    })
    return {"Authorization": f"Bearer {reg.json()['access_token']}"}


async def _company_id(client: AsyncClient) -> uuid.UUID:
    tag = uuid.uuid4().hex[:8]
    reg = await client.post("/api/v1/auth/register", json={
        "email": f"org-{tag}@example.com", "password": "secure-pass",
        "full_name": "Org", "role": "COMPANY",
    })
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    created = await client.post("/api/v1/companies/me", headers=headers, json={"name": f"Org {tag}"})
    assert created.status_code == 201
    return uuid.UUID(created.json()["id"])


async def _job(**fields) -> str:
    from conftest import TestingSessionLocal

    from app.domains.jobs.models import JobPost

    tag = uuid.uuid4().hex[:8]
    async with TestingSessionLocal() as db:
        job = JobPost(
            title="Role", slug=f"role-{tag}", description="x", company_name="Somewhere",
            is_remote=True, skills=["Python"], **fields,
        )
        db.add(job)
        await db.commit()
        return str(job.id)


@pytest.mark.asyncio
async def test_imported_listing_cannot_be_applied_to_in_platform(client: AsyncClient):
    headers = await _engineer(client)
    job_id = await _job(source="REMOTEOK", external_url="https://remoteok.com/remote-jobs/1")

    resp = await client.post(f"/api/v1/applications/jobs/{job_id}", headers=headers, json={})

    assert resp.status_code == 409
    assert "source site" in resp.json()["detail"].lower()
    from conftest import TestingSessionLocal

    from app.domains.applications.models import JobApplication

    async with TestingSessionLocal() as db:
        assert await db.scalar(select(JobApplication).where(JobApplication.job_id == uuid.UUID(job_id))) is None


@pytest.mark.asyncio
async def test_closed_or_removed_postings_cannot_be_applied_to(client: AsyncClient):
    headers = await _engineer(client)
    company_id = await _company_id(client)
    closed = await _job(company_id=company_id, is_active=False)
    removed = await _job(company_id=company_id, is_deleted=True)

    assert (await client.post(f"/api/v1/applications/jobs/{closed}", headers=headers, json={})).status_code == 409
    assert (await client.post(f"/api/v1/applications/jobs/{removed}", headers=headers, json={})).status_code == 404


@pytest.mark.asyncio
async def test_open_direct_posting_accepts_an_application(client: AsyncClient):
    headers = await _engineer(client)
    job_id = await _job(company_id=await _company_id(client))

    resp = await client.post(f"/api/v1/applications/jobs/{job_id}", headers=headers, json={})

    assert resp.status_code == 201
    assert resp.json()["status"] == "SUBMITTED"
