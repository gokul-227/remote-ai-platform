"""
Tests for Engineer and Company profiles & onboarding security.
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_engineer_profile_onboarding_flow(client: AsyncClient):
    # Register engineer
    reg = await client.post("/api/v1/auth/register", json={
        "email": "engineer_onboard@example.com",
        "password": "Password123!",
        "full_name": "Onboarding Engineer",
        "role": "engineer",
    })
    assert reg.status_code == 200
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create engineer profile
    profile_data = {
        "headline": "Senior Full-Stack Engineer",
        "bio": "Building scalable platforms with Python and TypeScript",
        "location": "Berlin, Germany",
        "country": "Germany",
        "timezone": "UTC+1",
        "primary_role": "Full-Stack Engineer",
        "skills": ["Python", "FastAPI", "React", "TypeScript", "PostgreSQL"],
        "years_of_experience": 6,
        "hourly_rate": 85.0,
        "availability": "Immediate",
        "github_url": "https://github.com/testengineer",
    }
    res = await client.post("/api/v1/engineers/me", json=profile_data, headers=headers)
    assert res.status_code == 201
    profile = res.json()
    assert profile["headline"] == "Senior Full-Stack Engineer"
    assert "Python" in profile["skills"]
    assert profile["profile_score"] is not None
    assert profile["profile_score"] > 0


@pytest.mark.asyncio
async def test_company_profile_onboarding_flow(client: AsyncClient):
    # Register company user
    reg = await client.post("/api/v1/auth/register", json={
        "email": "company_onboard@example.com",
        "password": "Password123!",
        "full_name": "Company Recruiter",
        "role": "company",
    })
    assert reg.status_code == 200
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create company profile
    company_data = {
        "name": "WorkMesh Technologies GmbH",
        "website": "https://workmesh.ai",
        "industry": "Software & AI",
        "company_size": "11-50",
        "location": "Munich, Germany",
        "country": "Germany",
        "description": "AI-powered remote work platform",
        "tech_stack": ["FastAPI", "Next.js", "PostgreSQL", "Redis", "MinIO"],
    }
    res = await client.post("/api/v1/companies/me", json=company_data, headers=headers)
    assert res.status_code == 201
    company = res.json()
    assert company["name"] == "WorkMesh Technologies GmbH"
    assert "FastAPI" in company["tech_stack"]
    assert company["is_verified"] is False


@pytest.mark.asyncio
async def test_company_profile_creation_requires_company_role(client: AsyncClient):
    # Register regular engineer
    reg = await client.post("/api/v1/auth/register", json={
        "email": "engineer_no_company@example.com",
        "password": "Password123!",
        "full_name": "Regular Engineer",
        "role": "engineer",
    })
    assert reg.status_code == 200
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Try creating company profile as engineer -> should be forbidden (403)
    company_data = {
        "name": "Unauthorized Inc",
        "industry": "Tech",
    }
    res = await client.post("/api/v1/companies/me", json=company_data, headers=headers)
    assert res.status_code == 403
