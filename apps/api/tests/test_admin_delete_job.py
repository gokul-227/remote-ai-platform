import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_delete_job_requires_admin_role(client: AsyncClient):
    reporter = await client.post(
        "/api/v1/auth/register",
        json={"email": "not-admin-2@example.com", "password": "secure-pass", "full_name": "Not Admin", "role": "ENGINEER"},
    )
    headers = {"Authorization": f"Bearer {reporter.json()['access_token']}"}

    resp = await client.delete("/api/v1/admin/jobs/00000000-0000-0000-0000-000000000000", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_delete_job(client: AsyncClient):
    from conftest import TestingSessionLocal
    from app.domains.auth.models import User, UserRole
    from app.domains.auth.router import create_access_token
    from app.domains.jobs.models import JobPost

    async with TestingSessionLocal() as db:
        admin = User(email="delete-job-admin@example.com", password_hash="hashed", full_name="Delete Job Admin", role=UserRole.ADMIN)
        db.add(admin)
        await db.flush()
        job = JobPost(title="Test Role To Delete", slug="test-role-to-delete", description="temp", company_name="Test Co", source="DIRECT")
        db.add(job)
        await db.flush()
        job_id = job.id
        token = create_access_token(admin)
        await db.commit()
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.delete(f"/api/v1/admin/jobs/{job_id}", headers=headers)
    assert resp.status_code == 204

    async with TestingSessionLocal() as db:
        assert await db.get(JobPost, job_id) is None

    logs = await client.get("/api/v1/admin/activity-logs", headers=headers)
    assert logs.status_code == 200
    assert any(log["action"] == "JOB_DELETED" for log in logs.json())

    again = await client.delete(f"/api/v1/admin/jobs/{job_id}", headers=headers)
    assert again.status_code == 404
