"""
Tests for AI Matching Engine logic.
"""

import pytest
import uuid
from httpx import AsyncClient
from app.domains.engineers.models import EngineerProfile
from app.domains.jobs.models import JobPost
from app.domains.matching.service import MatchingService


@pytest.mark.asyncio
async def test_matching_score_calculation(client: AsyncClient):
    from conftest import TestingSessionLocal
    async with TestingSessionLocal() as db:
        eng_id = uuid.uuid4()
        user_id = uuid.uuid4()

        engineer = EngineerProfile(
            id=eng_id,
            user_id=user_id,
            headline="Senior Python & React Engineer",
            years_of_experience=5,
            primary_role="Backend Engineer",
            skills=["Python", "FastAPI", "React", "PostgreSQL"],
        )

        job = JobPost(
            id=uuid.uuid4(),
            title="Senior Python Backend Engineer",
            slug="python-backend-eng",
            description="Looking for Python FastAPI expert",
            company_name="Remote AI Platform Test Co",
            is_remote=True,
            job_type="full-time",
            experience_level="senior",
            skills=["Python", "FastAPI", "PostgreSQL", "Docker"],
        )

        db.add(engineer)
        db.add(job)
        await db.flush()

        service = MatchingService(db)
        match_obj = await service.calculate_match(engineer, job)
        
        assert match_obj.overall_score > 60.0
        assert "Python" in match_obj.matching_skills
        assert "Docker" in match_obj.missing_skills
        assert len(match_obj.reasoning) > 0


@pytest.mark.asyncio
async def test_get_my_match_for_job_computes_on_demand(client: AsyncClient):
    """Powers the job detail page's AI match panel: an engineer with no prior
    match record for a job should get one computed and persisted on first view."""
    registered = await client.post("/api/v1/auth/register", json={
        "email": "match-viewer@example.com",
        "password": "secure-pass",
        "full_name": "Match Viewer",
        "role": "ENGINEER",
    })
    assert registered.status_code == 200
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}

    profile = await client.post("/api/v1/engineers/me", headers=headers, json={
        "headline": "Backend Engineer",
        "years_of_experience": 4,
        "skills": ["Python", "FastAPI"],
    })
    assert profile.status_code == 201

    from conftest import TestingSessionLocal
    from app.domains.jobs.models import JobPost

    async with TestingSessionLocal() as db:
        job = JobPost(
            title="Backend Engineer",
            slug="backend-engineer-match-test",
            description="Build APIs",
            company_name="Test Company",
            is_remote=True,
            skills=["Python", "FastAPI"],
        )
        db.add(job)
        await db.commit()
        job_id = str(job.id)

    res = await client.get(f"/api/v1/matching/jobs/{job_id}", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["job_id"] == job_id
    assert body["job"]["title"] == "Backend Engineer"
    assert "Python" in body["matching_skills"]
    assert 0 <= body["overall_score"] <= 100

    # Second call should return the same persisted match, not recompute.
    res2 = await client.get(f"/api/v1/matching/jobs/{job_id}", headers=headers)
    assert res2.status_code == 200
    assert res2.json()["id"] == body["id"]


@pytest.mark.asyncio
async def test_get_my_match_for_job_requires_engineer_role(client: AsyncClient):
    registered = await client.post("/api/v1/auth/register", json={
        "email": "match-company@example.com",
        "password": "secure-pass",
        "full_name": "A Company",
        "role": "COMPANY",
    })
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    res = await client.get(f"/api/v1/matching/jobs/{uuid.uuid4()}", headers=headers)
    assert res.status_code == 403
