import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_worker_company_marketplace_journey(client: AsyncClient):
    company = await client.post("/api/v1/auth/register", json={
        "email": "e2e-company@example.com", "password": "secure-pass", "full_name": "E2E Company", "role": "COMPANY",
    })
    company_headers = {"Authorization": f"Bearer {company.json()['access_token']}"}
    company_profile = await client.post("/api/v1/companies/me", headers=company_headers, json={"name": "E2E Labs"})
    assert company_profile.status_code == 201

    worker = await client.post("/api/v1/auth/register", json={
        "email": "e2e-worker@example.com", "password": "secure-pass", "full_name": "E2E Worker", "role": "ENGINEER",
    })
    worker_headers = {"Authorization": f"Bearer {worker.json()['access_token']}"}
    profile = await client.post("/api/v1/engineers/me", headers=worker_headers, json={"headline": "E2E Python Engineer", "skills": ["Python", "FastAPI"]})
    assert profile.status_code == 201

    from conftest import TestingSessionLocal
    from app.domains.jobs.models import JobPost

    async with TestingSessionLocal() as db:
        job = JobPost(title="E2E Backend Role", slug="e2e-backend-role", description="Build APIs", company_name="E2E Labs", company_id=uuid.UUID(company_profile.json()["id"]), source="DIRECT")
        db.add(job)
        await db.flush()
        job_id = str(job.id)
        await db.commit()

    application = await client.post(f"/api/v1/applications/jobs/{job_id}", headers=worker_headers, json={"cover_note": "Ready to build reliable APIs."})
    assert application.status_code == 201
    application_id = application.json()["id"]
    company_view = await client.get("/api/v1/applications/company", headers=company_headers)
    assert company_view.status_code == 200
    assert any(item["application"]["id"] == application_id for item in company_view.json())
    reviewed = await client.patch(f"/api/v1/applications/{application_id}/status", headers=company_headers, json={"status": "REVIEWING"})
    assert reviewed.status_code == 200


@pytest.mark.asyncio
async def test_admin_control_and_moderation_journey(client: AsyncClient):
    from conftest import TestingSessionLocal
    from app.domains.auth.models import User, UserRole
    from app.domains.auth.router import create_access_token

    target = await client.post("/api/v1/auth/register", json={
        "email": "e2e-target@example.com", "password": "secure-pass", "full_name": "E2E Target", "role": "ENGINEER",
    })
    target_headers = {"Authorization": f"Bearer {target.json()['access_token']}"}

    async with TestingSessionLocal() as db:
        admin = User(email="e2e-admin@example.com", password_hash="hashed", full_name="E2E Admin", role=UserRole.ADMIN)
        db.add(admin)
        await db.flush()
        admin_headers = {"Authorization": f"Bearer {create_access_token(admin)}"}
        await db.commit()

    users = await client.get("/api/v1/admin/users", headers=admin_headers)
    assert users.status_code == 200
    target_record = next(item for item in users.json() if item["email"] == "e2e-target@example.com")
    suspended = await client.patch(f"/api/v1/admin/users/{target_record['id']}/status", headers=admin_headers, json={"is_active": False})
    assert suspended.status_code == 200
    blocked = await client.get("/api/v1/engineers/me", headers=target_headers)
    assert blocked.status_code == 403

    logs = await client.get("/api/v1/admin/activity-logs", headers=admin_headers)
    assert logs.status_code == 200
    assert any(log["action"] == "USER_STATUS_UPDATED" for log in logs.json())
