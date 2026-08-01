"""
Tests for Job domain and Aggregators.
"""

import pytest
from httpx import AsyncClient
from app.domains.jobs.aggregators.remoteok import RemoteOKAggregator
from app.domains.jobs.aggregators.arbeitnow import ArbeitnowAggregator
from app.domains.jobs.aggregators.remotive import RemotiveAggregator


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
