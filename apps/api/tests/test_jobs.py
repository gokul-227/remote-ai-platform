"""
Tests for Job domain and Aggregators.
"""

import pytest
import uuid
from httpx import AsyncClient
from app.domains.jobs.aggregators.remoteok import RemoteOKAggregator
from app.domains.jobs.aggregators.arbeitnow import ArbeitnowAggregator
from app.domains.jobs.aggregators.remotive import RemotiveAggregator
from app.domains.jobs.models import JobPost


@pytest.mark.asyncio
async def test_list_jobs_empty(client: AsyncClient):
    response = await client.get("/api/v1/jobs")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_remoteok_aggregator_clean_text():
    agg = RemoteOKAggregator()
    clean = agg.clean_text("<p>Python <strong>Developer</strong> position</p>")
    assert clean == "Python Developer position"


@pytest.mark.asyncio
async def test_aggregator_extract_skills():
    agg = RemoteOKAggregator()
    skills = agg.extract_skills("We need a Senior Python and React engineer with FastAPI experience")
    assert "Python" in skills
    assert "React" in skills
    assert "FastAPI" in skills


@pytest.mark.asyncio
async def test_job_search_applies_skills_salary_and_portable_keyword_filter(client: AsyncClient):
    from conftest import TestingSessionLocal

    async with TestingSessionLocal() as db:
        db.add_all(
            [
                JobPost(
                    id=uuid.uuid4(),
                    title="Senior Python Engineer",
                    slug="senior-python-engineer",
                    description="Build APIs with FastAPI",
                    company_name="Acme",
                    is_remote=True,
                    salary_min=120000,
                    salary_max=150000,
                    skills=["Python", "FastAPI"],
                ),
                JobPost(
                    id=uuid.uuid4(),
                    title="Frontend Engineer",
                    slug="frontend-engineer",
                    description="Build interfaces with React",
                    company_name="Beta",
                    is_remote=True,
                    salary_min=90000,
                    salary_max=110000,
                    skills=["React", "TypeScript"],
                ),
            ]
        )
        await db.commit()

    response = await client.get(
        "/api/v1/jobs",
        params=[("skills", "Python"), ("max_salary", "160000"), ("query", "FastAPI")],
    )

    assert response.status_code == 200
    jobs = response.json()
    assert len(jobs) == 1
    assert jobs[0]["title"] == "Senior Python Engineer"
