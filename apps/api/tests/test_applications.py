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


async def _company_job_and_engineer(client: AsyncClient, tag: str):
    company = await client.post("/api/v1/auth/register", json={"email": f"co-{tag}@example.com", "password": "secure-pass", "full_name": f"Co {tag}", "role": "COMPANY"})
    company_headers = {"Authorization": f"Bearer {company.json()['access_token']}"}
    await client.post("/api/v1/companies/me", headers=company_headers, json={"name": f"Invite Labs {tag}"})
    engineer = await client.post("/api/v1/auth/register", json={"email": f"eng-{tag}@example.com", "password": "secure-pass", "full_name": f"Eng {tag}", "role": "ENGINEER"})
    engineer_headers = {"Authorization": f"Bearer {engineer.json()['access_token']}"}
    profile_id = (await client.post("/api/v1/engineers/me", headers=engineer_headers, json={"headline": "Engineer", "skills": ["Go"]})).json()["id"]

    from conftest import TestingSessionLocal
    from sqlalchemy import select
    from app.domains.companies.models import CompanyProfile
    from app.domains.jobs.models import JobPost

    async with TestingSessionLocal() as db:
        co = await db.scalar(select(CompanyProfile).where(CompanyProfile.name == f"Invite Labs {tag}"))
        job = JobPost(company_id=co.id, title=f"Invited role {tag}", slug=f"invited-role-{tag}", description="x", company_name=co.name, is_remote=True, skills=["Go"])
        db.add(job)
        await db.commit()
        job_id = str(job.id)
    return company_headers, engineer_headers, profile_id, job_id


@pytest.mark.asyncio
async def test_engineer_accepts_invitation_and_company_is_notified(client: AsyncClient):
    company_headers, engineer_headers, profile_id, job_id = await _company_job_and_engineer(client, "accept")
    invited = await client.post(f"/api/v1/applications/jobs/{job_id}/invite/{profile_id}", headers=company_headers)
    assert invited.status_code == 201
    notes = (await client.get("/api/v1/notifications", headers=engineer_headers)).json()
    assert any(n["kind"] == "application_invite" for n in notes)

    accepted = await client.patch(f"/api/v1/applications/{invited.json()['id']}/respond", headers=engineer_headers, json={"accept": True, "note": "Keen!"})
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "REVIEWING"
    assert accepted.json()["cover_note"] == "Keen!"
    company_notes = (await client.get("/api/v1/notifications", headers=company_headers)).json()
    assert any(n["title"] == "Invitation accepted" for n in company_notes)

    # Answering twice, or re-inviting a candidate already under review, changes nothing.
    again = await client.patch(f"/api/v1/applications/{invited.json()['id']}/respond", headers=engineer_headers, json={"accept": False})
    assert again.status_code == 409
    reinvite = await client.post(f"/api/v1/applications/jobs/{job_id}/invite/{profile_id}", headers=company_headers)
    assert reinvite.json()["status"] == "REVIEWING"


@pytest.mark.asyncio
async def test_engineer_declines_invitation_and_only_owner_can_respond(client: AsyncClient):
    company_headers, engineer_headers, profile_id, job_id = await _company_job_and_engineer(client, "decline")
    invited = await client.post(f"/api/v1/applications/jobs/{job_id}/invite/{profile_id}", headers=company_headers)
    other = await client.post("/api/v1/auth/register", json={"email": "intruder@example.com", "password": "secure-pass", "full_name": "Intruder", "role": "ENGINEER"})
    other_headers = {"Authorization": f"Bearer {other.json()['access_token']}"}
    assert (await client.patch(f"/api/v1/applications/{invited.json()['id']}/respond", headers=other_headers, json={"accept": True})).status_code == 404
    declined = await client.patch(f"/api/v1/applications/{invited.json()['id']}/respond", headers=engineer_headers, json={"accept": False})
    assert declined.json()["status"] == "WITHDRAWN"


@pytest.mark.asyncio
async def test_company_applications_include_candidate_match_and_job_filter(client: AsyncClient):
    company_headers, engineer_headers, profile_id, job_id = await _company_job_and_engineer(client, "match")
    applied = await client.post(f"/api/v1/applications/jobs/{job_id}", headers=engineer_headers, json={})
    assert applied.status_code == 201
    [row] = (await client.get("/api/v1/applications/company", headers=company_headers)).json()
    assert row["match"] is None
    assert row["candidate"]["engineer_profile_id"] == profile_id

    computed = await client.get(f"/api/v1/matching/jobs/{job_id}", headers=engineer_headers)
    assert computed.status_code == 200
    [row] = (await client.get("/api/v1/applications/company", headers=company_headers, params={"job_id": job_id})).json()
    assert row["match"]["overall_score"] == computed.json()["overall_score"]
    assert "Go" in row["match"]["matching_skills"]
    other_job = "00000000-0000-0000-0000-000000000000"
    assert (await client.get("/api/v1/applications/company", headers=company_headers, params={"job_id": other_job})).json() == []
