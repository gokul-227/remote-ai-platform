import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User, UserRole


@pytest.mark.asyncio
async def test_admin_ai_usage_stats(client: AsyncClient, test_user: User, auth_headers: dict[str, str], db: AsyncSession):
    test_user.role = UserRole.ADMIN
    await db.commit()

    res = await client.get("/api/v1/admin/ai-usage", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "total_calls" in data
    assert "total_tokens" in data
    assert "estimated_cost_usd" in data
    assert "model_breakdown" in data


@pytest.mark.asyncio
async def test_admin_system_health_details(client: AsyncClient, test_user: User, auth_headers: dict[str, str], db: AsyncSession):
    test_user.role = UserRole.ADMIN
    await db.commit()

    res = await client.get("/api/v1/admin/health/details", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["overall_status"] in {"OPERATIONAL", "DEGRADED"}
    assert len(data["services"]) >= 4


@pytest.mark.asyncio
async def test_moderation_report_and_admin_decision_lifecycle(client: AsyncClient, test_user: User, auth_headers: dict[str, str], db: AsyncSession):
    # 1. Register a user to be reported
    bad_actor_resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "spammer@example.com", "password": "SpamPassword123!", "full_name": "Spam User", "role": "ENGINEER"}
    )
    assert bad_actor_resp.status_code == 200
    bad_actor_id = bad_actor_resp.json()["user"]["id"]

    # 2. Regular user files a moderation report against the bad actor
    report_resp = await client.post(
        "/api/v1/moderation/reports",
        json={
            "target_type": "USER",
            "target_id": bad_actor_id,
            "reason": "Sending unsolicited spam messages and phishing links.",
        },
        headers=auth_headers,
    )
    assert report_resp.status_code == 201
    report_id = report_resp.json()["id"]

    # 3. Regular user is forbidden from listing or deciding moderation reports
    list_forbidden = await client.get("/api/v1/moderation/reports", headers=auth_headers)
    assert list_forbidden.status_code == 403

    decide_forbidden = await client.patch(
        f"/api/v1/moderation/reports/{report_id}",
        json={"status": "RESOLVED", "decision": "SUSPEND_USER", "note": "Account suspended"},
        headers=auth_headers,
    )
    assert decide_forbidden.status_code == 403

    # 4. Elevate test_user to ADMIN
    test_user.role = UserRole.ADMIN
    await db.commit()

    # 5. Admin lists open reports
    reports_list = await client.get("/api/v1/moderation/reports", headers=auth_headers)
    assert reports_list.status_code == 200
    assert any(r["id"] == report_id for r in reports_list.json())

    # 6. Admin resolves report with SUSPEND_USER decision
    decide_resp = await client.patch(
        f"/api/v1/moderation/reports/{report_id}",
        json={"status": "RESOLVED", "decision": "SUSPEND_USER", "note": "Confirmed phishing activities; user suspended."},
        headers=auth_headers,
    )
    assert decide_resp.status_code == 200
    resolved = decide_resp.json()
    assert resolved["status"] == "RESOLVED"
    assert resolved["decision"] == "SUSPEND_USER"

    # Verify bad actor is now inactive
    bad_user = await db.get(User, uuid.UUID(bad_actor_id))
    assert bad_user is not None
    assert bad_user.is_active is False

