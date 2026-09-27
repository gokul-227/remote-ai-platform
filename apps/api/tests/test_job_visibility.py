"""Phase 04 IDOR audit: hidden or removed jobs are not public by id."""

import uuid

import pytest
from auth_support import token_for
from httpx import AsyncClient
from sqlalchemy import select


async def _org(client: AsyncClient):
    from conftest import TestingSessionLocal

    from app.domains.auth.models import User

    email = f"org-{uuid.uuid4().hex[:8]}@example.com"
    await client.post("/api/v1/auth/register", json={"email": email, "password": "p", "full_name": "O", "role": "COMPANY"})
    async with TestingSessionLocal() as db:
        user = await db.scalar(select(User).where(User.email == email))
    company = await client.post(
        "/api/v1/companies/me", headers={"Authorization": f"Bearer {token_for(user)}"}, json={"name": f"O{email}"}
    )
    return user, uuid.UUID(company.json()["id"])


async def _job(company_id, **fields) -> str:
    from conftest import TestingSessionLocal

    from app.domains.jobs.models import JobPost

    async with TestingSessionLocal() as db:
        job = JobPost(company_id=company_id, title="Role", slug=f"r-{uuid.uuid4().hex[:8]}", description="x",
                      company_name="O", is_remote=True, skills=[], **fields)
        db.add(job)
        await db.commit()
        return str(job.id)


@pytest.mark.asyncio
async def test_hidden_and_removed_jobs_are_not_public(client: AsyncClient):
    owner, company_id = await _org(client)
    other, _ = await _org(client)
    open_job = await _job(company_id)
    hidden = await _job(company_id, is_active=False)
    removed = await _job(company_id, is_deleted=True)

    assert (await client.get(f"/api/v1/jobs/{open_job}")).status_code == 200
    for job_id in (hidden, removed):
        assert (await client.get(f"/api/v1/jobs/{job_id}")).status_code == 404
        other_h = {"Authorization": f"Bearer {token_for(other)}"}
        assert (await client.get(f"/api/v1/jobs/{job_id}", headers=other_h)).status_code == 404
    owner_h = {"Authorization": f"Bearer {token_for(owner)}"}
    assert (await client.get(f"/api/v1/jobs/{hidden}", headers=owner_h)).status_code == 200
