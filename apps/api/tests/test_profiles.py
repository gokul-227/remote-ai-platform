"""
Tests for Engineer and Company profiles & onboarding security.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


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
async def test_engineer_profile_endpoints_expose_full_name(client: AsyncClient):
    """EngineerProfile has no name column of its own — full_name is a
    computed property sourced from the linked User. Regression test for a
    real gap found via UI audit: candidate/professional cards across the
    app could only ever show a role/headline, never the person's actual
    name, because these endpoints never returned it.
    """
    reg = await client.post("/api/v1/auth/register", json={
        "email": "named_engineer@example.com",
        "password": "Password123!",
        "full_name": "Jordan Rivera",
        "role": "engineer",
    })
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    create_res = await client.post(
        "/api/v1/engineers/me",
        json={"headline": "Backend Engineer", "skills": ["Go"], "is_public": True},
        headers=headers,
    )
    profile_id = create_res.json()["id"]
    assert create_res.json()["full_name"] == "Jordan Rivera"

    by_id_res = await client.get(f"/api/v1/engineers/{profile_id}")
    assert by_id_res.json()["full_name"] == "Jordan Rivera"

    list_res = await client.get("/api/v1/engineers")
    listed = next(e for e in list_res.json() if e["id"] == profile_id)
    assert listed["full_name"] == "Jordan Rivera"

    search_res = await client.get("/api/v1/engineers/search")
    found = next((e for e in search_res.json() if e["id"] == profile_id), None)
    assert found is not None
    assert found["full_name"] == "Jordan Rivera"


@pytest.mark.asyncio
async def test_public_engineer_profile_hides_resume_url_from_anonymous_callers(
    client: AsyncClient, db: AsyncSession
):
    reg = await client.post("/api/v1/auth/register", json={
        "email": "engineer_resume_privacy@example.com",
        "password": "Password123!",
        "full_name": "Resume Privacy Engineer",
        "role": "engineer",
    })
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    profile_res = await client.post(
        "/api/v1/engineers/me",
        json={"headline": "Backend Engineer", "skills": ["Go"]},
        headers=headers,
    )
    profile_id = profile_res.json()["id"]

    # Directly set a resume_url as if a resume had been uploaded, bypassing
    # the upload endpoint (which needs real file bytes) for this test.
    import uuid

    from app.domains.engineers.models import EngineerProfile

    db_profile = await db.get(EngineerProfile, uuid.UUID(profile_id))
    db_profile.resume_url = "http://localhost:9000/remote-ai-platform-resumes/resumes/secret.pdf"
    await db.commit()

    # Anonymous (no token) request must NOT see resume_url — this is the
    # actual public directory-browsing path (GET /engineers/{id} has no auth
    # dependency at all). The public schema omits the field entirely rather
    # than including it as null.
    anon_res = await client.get(f"/api/v1/engineers/{profile_id}")
    assert anon_res.status_code == 200
    assert "resume_url" not in anon_res.json()

    # A DIFFERENT authenticated user (not the profile owner, not an admin)
    # must not see it either -- this was the actual PII leak a security
    # audit found: any logged-in user, not just companies/self, could pull
    # another engineer's resume data via this exact endpoint.
    other_reg = await client.post("/api/v1/auth/register", json={
        "email": "another_authenticated_user@example.com",
        "password": "Password123!",
        "full_name": "Another User",
        "role": "engineer",
    })
    other_headers = {"Authorization": f"Bearer {other_reg.json()['access_token']}"}
    auth_res = await client.get(f"/api/v1/engineers/{profile_id}", headers=other_headers)
    assert auth_res.status_code == 200
    assert "resume_url" not in auth_res.json()

    # The profile owner sees their own resume_url.
    own_res = await client.get(f"/api/v1/engineers/{profile_id}", headers=headers)
    assert own_res.status_code == 200
    assert own_res.json()["resume_url"] is not None

    # An admin sees it too.
    from conftest import TestingSessionLocal
    from app.domains.auth.models import User, UserRole
    from app.domains.auth.router import create_access_token

    async with TestingSessionLocal() as admin_db:
        admin = User(
            email="resume_privacy_admin@example.com",
            password_hash="hashed",
            full_name="Resume Privacy Admin",
            role=UserRole.ADMIN,
        )
        admin_db.add(admin)
        await admin_db.flush()
        admin_token = create_access_token(admin)
        await admin_db.commit()
    admin_res = await client.get(
        f"/api/v1/engineers/{profile_id}", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert admin_res.status_code == 200
    assert admin_res.json()["resume_url"] is not None

    # Bulk listing/search endpoints never include resume_url, authenticated or not.
    list_res = await client.get("/api/v1/engineers", headers=other_headers)
    assert list_res.status_code == 200
    assert all("resume_url" not in item for item in list_res.json())


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
