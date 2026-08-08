import uuid
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_admin_console_exposes_metrics_and_audit_logs(client: AsyncClient):
    from conftest import TestingSessionLocal
    from app.domains.auth.models import User, UserRole
    from app.domains.auth.router import create_access_token

    async with TestingSessionLocal() as db:
        admin = User(email="console-admin@example.com", password_hash="hashed", full_name="Console Admin", role=UserRole.ADMIN)
        db.add(admin)
        await db.flush()
        token = create_access_token(admin)
        await db.commit()
    headers = {"Authorization": f"Bearer {token}"}

    stats = await client.get("/api/v1/admin/stats", headers=headers)
    assert stats.status_code == 200
    assert "total_users" in stats.json()
    users = await client.get("/api/v1/admin/users", headers=headers)
    assert users.status_code == 200
    target = next(user for user in users.json() if user["email"] == "console-admin@example.com")
    suspended = await client.patch(f"/api/v1/admin/users/{target['id']}/status", headers=headers, json={"is_active": False})
    assert suspended.status_code == 200
    # The test admin is intentionally suspended last; use a fresh admin identity for the audit read.
    async with TestingSessionLocal() as db:
        admin = User(email="console-admin-2@example.com", password_hash="hashed", full_name="Console Admin 2", role=UserRole.ADMIN)
        db.add(admin)
        await db.flush()
        audit_token = create_access_token(admin)
        await db.commit()
    logs = await client.get("/api/v1/admin/activity-logs", headers={"Authorization": f"Bearer {audit_token}"})
    assert logs.status_code == 200
    assert any(log["action"] == "USER_STATUS_UPDATED" for log in logs.json())

    reporter = await client.post("/api/v1/auth/register", json={"email": "reporter@example.com", "password": "secure-pass", "full_name": "Reporter", "role": "ENGINEER"})
    reporter_headers = {"Authorization": f"Bearer {reporter.json()['access_token']}"}
    from app.domains.jobs.models import JobPost
    async with TestingSessionLocal() as db:
        job = JobPost(title="Reported Job", slug="reported-job", description="A job to moderate", company_name="Example", source="DIRECT")
        db.add(job)
        await db.flush()
        job_id = job.id
        job_id_str = str(job.id)
        await db.commit()
    report = await client.post("/api/v1/moderation/reports", headers=reporter_headers, json={"target_type": "JOB", "target_id": job_id_str, "reason": "This listing contains misleading information."})
    assert report.status_code == 201
    report_id = report.json()["id"]
    moderation_queue = await client.get("/api/v1/moderation/reports", headers={"Authorization": f"Bearer {audit_token}"})
    assert moderation_queue.status_code == 200
    decision = await client.patch(f"/api/v1/moderation/reports/{report_id}", headers={"Authorization": f"Bearer {audit_token}"}, json={"status": "RESOLVED", "decision": "HIDE_JOB", "note": "Confirmed misleading listing."})
    assert decision.status_code == 200
    async with TestingSessionLocal() as db:
        moderated_job = await db.get(JobPost, uuid.UUID(str(job_id)))
        assert moderated_job is not None
        assert moderated_job.is_active is False
