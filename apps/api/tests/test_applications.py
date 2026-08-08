import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_application_status_lifecycle(client: AsyncClient):
    registered = await client.post("/api/v1/auth/register", json={
        "email": "applicant@example.com",
        "password": "secure-pass",
        "full_name": "Applicant",
        "role": "ENGINEER",
    })
    assert registered.status_code == 200
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}

    from conftest import TestingSessionLocal
    from app.domains.jobs.models import JobPost

    async with TestingSessionLocal() as db:
        job = JobPost(
            title="Python Engineer",
            slug="python-engineer-application-test",
            description="Build APIs",
            company_name="Test Company",
            is_remote=True,
            skills=["Python"],
        )
        db.add(job)
        await db.commit()
        job_id = str(job.id)

    applied = await client.post(f"/api/v1/applications/jobs/{job_id}", headers=headers, json={"cover_note": "Interested"})
    assert applied.status_code == 201
    assert applied.json()["status"] == "SUBMITTED"
    application_id = applied.json()["id"]

    withdrawn = await client.patch(f"/api/v1/applications/{application_id}/withdraw", headers=headers)
    assert withdrawn.status_code == 200
    assert withdrawn.json()["status"] == "WITHDRAWN"

    second_withdraw = await client.patch(f"/api/v1/applications/{application_id}/withdraw", headers=headers)
    assert second_withdraw.status_code == 409


@pytest.mark.asyncio
async def test_company_can_review_owned_job_application(client: AsyncClient):
    company_registered = await client.post("/api/v1/auth/register", json={
        "email": "reviewer@example.com",
        "password": "secure-pass",
        "full_name": "Hiring Company",
        "role": "COMPANY",
    })
    company_headers = {"Authorization": f"Bearer {company_registered.json()['access_token']}"}
    company_profile = await client.post("/api/v1/companies/me", headers=company_headers, json={"name": "Hiring Labs"})
    assert company_profile.status_code == 201

    engineer_registered = await client.post("/api/v1/auth/register", json={
        "email": "candidate@example.com",
        "password": "secure-pass",
        "full_name": "Candidate Engineer",
        "role": "ENGINEER",
    })
    engineer_headers = {"Authorization": f"Bearer {engineer_registered.json()['access_token']}"}
    profile = await client.post(
        "/api/v1/engineers/me",
        headers=engineer_headers,
        json={"headline": "Candidate Engineer", "skills": ["Python"]},
    )
    assert profile.status_code == 201
    profile_id = profile.json()["id"]

    from conftest import TestingSessionLocal
    from app.domains.companies.models import CompanyProfile
    from app.domains.jobs.models import JobPost
    from sqlalchemy import select

    async with TestingSessionLocal() as db:
        company = await db.scalar(select(CompanyProfile).where(CompanyProfile.name == "Hiring Labs"))
        job = JobPost(
            company_id=company.id,
            title="Reviewable Engineer",
            slug="reviewable-engineer",
            description="Build APIs",
            company_name="Hiring Labs",
            is_remote=True,
            skills=["Python"],
        )
        db.add(job)
        await db.commit()
        job_id = str(job.id)

    applied = await client.post(f"/api/v1/applications/jobs/{job_id}", headers=engineer_headers, json={})
    assert applied.status_code == 201
    application_id = applied.json()["id"]

    invited = await client.post(f"/api/v1/applications/jobs/{job_id}/invite/{profile_id}", headers=company_headers)
    assert invited.status_code == 201
    assert invited.json()["status"] == "INVITED"

    company_list = await client.get("/api/v1/applications/company", headers=company_headers)
    assert company_list.status_code == 200
    assert company_list.json()[0]["candidate"]["full_name"] == "Candidate Engineer"

    reviewing = await client.patch(
        f"/api/v1/applications/{application_id}/status",
        headers=company_headers,
        json={"status": "REVIEWING"},
    )
    assert reviewing.status_code == 200
    assert reviewing.json()["status"] == "REVIEWING"

    invalid = await client.patch(
        f"/api/v1/applications/{application_id}/status",
        headers=company_headers,
        json={"status": "ACCEPTED"},
    )
    assert invalid.status_code == 409
