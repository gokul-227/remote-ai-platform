import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_update_role_requires_admin(client: AsyncClient):
    reporter = await client.post(
        "/api/v1/auth/register",
        json={"email": "not-admin-3@example.com", "password": "secure-pass", "full_name": "Not Admin", "role": "ENGINEER"},
    )
    headers = {"Authorization": f"Bearer {reporter.json()['access_token']}"}

    resp = await client.patch(
        "/api/v1/admin/users/00000000-0000-0000-0000-000000000000/role",
        headers=headers,
        json={"role": "ADMIN"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_promote_user_to_admin(client: AsyncClient):
    from conftest import TestingSessionLocal
    from app.domains.auth.models import User, UserRole
    from app.domains.auth.router import create_access_token

    async with TestingSessionLocal() as db:
        admin = User(email="role-admin@example.com", password_hash="hashed", full_name="Role Admin", role=UserRole.ADMIN)
        target = User(email="promote-me@example.com", password_hash="hashed", full_name="Promote Me", role=UserRole.ENGINEER)
        db.add_all([admin, target])
        await db.flush()
        target_id = target.id
        token = create_access_token(admin)
        await db.commit()
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.patch(f"/api/v1/admin/users/{target_id}/role", headers=headers, json={"role": "ADMIN"})
    assert resp.status_code == 200
    assert resp.json()["role"] == "ADMIN"

    async with TestingSessionLocal() as db:
        refreshed = await db.get(User, target_id)
        assert refreshed.role == UserRole.ADMIN

    logs = await client.get("/api/v1/admin/activity-logs", headers=headers)
    assert logs.status_code == 200
    assert any(log["action"] == "USER_ROLE_UPDATED" for log in logs.json())
