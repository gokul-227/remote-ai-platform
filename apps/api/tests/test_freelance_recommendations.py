"""Uber-style allocation for freelance work: the same explainable scores, narrowed to freelance-type jobs."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.jobs.models import JobPost


@pytest.mark.asyncio
async def test_freelance_kind_only_returns_freelance_type_work(client: AsyncClient, db: AsyncSession):
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": f"fr_{uuid.uuid4().hex[:8]}@test.com", "password": "Password123!", "full_name": "F", "role": "ENGINEER"},
    )
    h = {"Authorization": f"Bearer {res.json()['access_token']}"}
    await client.post("/api/v1/engineers/me", headers=h, json={"headline": "Python dev", "skills": ["Python", "FastAPI"], "years_experience": 5})
    for title, jt in [("Python freelance API", "freelance"), ("Python contract", "contract"), ("Python staff role", "full-time")]:
        db.add(JobPost(title=title, slug=f"s-{uuid.uuid4().hex[:6]}", description="Python FastAPI", company_name="Co",
                       is_remote=True, skills=["Python", "FastAPI"], job_type=jt, source="DIRECT"))
    await db.commit()

    free = await client.get("/api/v1/matching/recommendations", params={"kind": "freelance", "limit": 50}, headers=h)
    assert free.status_code == 200, free.text
    types = {m["job"]["job_type"] for m in free.json()}
    assert types and types <= {"freelance", "contract", "part-time", "temporary"}
    everything = await client.get("/api/v1/matching/recommendations", params={"limit": 50}, headers=h)
    assert "full-time" in {m["job"]["job_type"] for m in everything.json()}
    assert (await client.get("/api/v1/matching/recommendations", params={"kind": "bogus"}, headers=h)).status_code == 422
