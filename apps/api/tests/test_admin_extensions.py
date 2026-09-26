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



@pytest.mark.asyncio
async def test_posts_can_be_reported_and_removed_by_admin(client: AsyncClient, test_user: User, auth_headers: dict[str, str], db: AsyncSession):
    author = await client.post("/api/v1/auth/register", json={"email": "poster@example.com", "password": "PostPassword123!", "full_name": "Poster", "role": "ENGINEER"})
    author_headers = {"Authorization": f"Bearer {author.json()['access_token']}"}
    post = await client.post("/api/v1/social/posts", headers=author_headers, json={"content": "Buy followers now!!!"})
    assert post.status_code == 201, post.text
    post_id = post.json()["id"]

    # Authors can't report their own post; others can, once.
    own = await client.post("/api/v1/moderation/reports", headers=author_headers, json={"target_type": "POST", "target_id": post_id, "reason": "Reporting myself"})
    assert own.status_code == 404
    report = await client.post("/api/v1/moderation/reports", headers=auth_headers, json={"target_type": "POST", "target_id": post_id, "reason": "Spam or misleading content"})
    assert report.status_code == 201
    dup = await client.post("/api/v1/moderation/reports", headers=auth_headers, json={"target_type": "POST", "target_id": post_id, "reason": "Spam or misleading content"})
    assert dup.status_code == 409

    test_user.role = UserRole.ADMIN
    await db.commit()
    wrong = await client.patch(f"/api/v1/moderation/reports/{report.json()['id']}", headers=auth_headers, json={"status": "RESOLVED", "decision": "HIDE_JOB"})
    assert wrong.status_code == 422
    removed = await client.patch(f"/api/v1/moderation/reports/{report.json()['id']}", headers=auth_headers, json={"status": "RESOLVED", "decision": "REMOVE_POST", "note": "Spam"})
    assert removed.status_code == 200
    assert (await client.get(f"/api/v1/social/posts/{post_id}", headers=author_headers)).status_code == 404


@pytest.mark.asyncio
async def test_admin_verification_queue_and_job_list(client: AsyncClient, test_user: User, auth_headers: dict[str, str], db: AsyncSession):
    eng = await client.post("/api/v1/auth/register", json={"email": "verify-me@example.com", "password": "VerifyPassword123!", "full_name": "Verify Me", "role": "ENGINEER"})
    eh = {"Authorization": f"Bearer {eng.json()['access_token']}"}
    req = await client.post("/api/v1/trust/verifications", headers=eh, json={"verification_type": "GITHUB"})
    assert req.status_code == 201

    # Non-admins can't see the queue or the full job list.
    assert (await client.get("/api/v1/trust/verifications", headers=eh)).status_code == 403
    assert (await client.get("/api/v1/admin/jobs", headers=eh)).status_code == 403

    test_user.role = UserRole.ADMIN
    await db.commit()
    queue = (await client.get("/api/v1/trust/verifications", headers=auth_headers)).json()
    assert [v["id"] for v in queue] == [req.json()["id"]]
    reviewed = await client.patch(f"/api/v1/trust/verifications/{req.json()['id']}/review", headers=auth_headers, json={"status": "VERIFIED"})
    assert reviewed.status_code == 200
    assert (await client.get("/api/v1/trust/verifications", headers=auth_headers)).json() == []

    from app.domains.jobs.models import JobPost
    db.add(JobPost(title="Hidden role", slug="hidden-role", description="x", company_name="Hidden Co", is_active=False))
    await db.commit()
    jobs = (await client.get("/api/v1/admin/jobs", headers=auth_headers, params={"q": "hidden"})).json()
    assert [j["title"] for j in jobs] == ["Hidden role"] and jobs[0]["is_active"] is False
