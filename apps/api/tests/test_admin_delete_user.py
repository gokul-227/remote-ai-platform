import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_delete_user_requires_admin_role(client: AsyncClient):
    reporter = await client.post(
        "/api/v1/auth/register",
        json={"email": "not-admin@example.com", "password": "secure-pass", "full_name": "Not Admin", "role": "ENGINEER"},
    )
    headers = {"Authorization": f"Bearer {reporter.json()['access_token']}"}

    resp = await client.delete("/api/v1/admin/users/00000000-0000-0000-0000-000000000000", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_cannot_delete_own_account(client: AsyncClient):
    from conftest import TestingSessionLocal
    from app.domains.auth.models import User, UserRole
    from app.domains.auth.router import create_access_token

    async with TestingSessionLocal() as db:
        admin = User(email="self-delete-admin@example.com", password_hash="hashed", full_name="Self Delete Admin", role=UserRole.ADMIN)
        db.add(admin)
        await db.flush()
        admin_id = admin.id
        token = create_access_token(admin)
        await db.commit()
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.delete(f"/api/v1/admin/users/{admin_id}", headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_admin_can_delete_user_and_cascades_dependent_data(client: AsyncClient):
    from conftest import TestingSessionLocal
    from app.domains.auth.models import User, UserRole
    from app.domains.auth.router import create_access_token
    from app.domains.engineers.models import EngineerProfile

    async with TestingSessionLocal() as db:
        admin = User(email="delete-admin@example.com", password_hash="hashed", full_name="Delete Admin", role=UserRole.ADMIN)
        target = User(email="delete-target@example.com", password_hash="hashed", full_name="Delete Target", role=UserRole.ENGINEER)
        db.add_all([admin, target])
        await db.flush()
        target_id = target.id
        profile = EngineerProfile(user_id=target.id, headline="Test Engineer")
        db.add(profile)
        admin_token = create_access_token(admin)
        await db.commit()
    headers = {"Authorization": f"Bearer {admin_token}"}

    resp = await client.delete(f"/api/v1/admin/users/{target_id}", headers=headers)
    assert resp.status_code == 204

    async with TestingSessionLocal() as db:
        assert await db.get(User, target_id) is None
        remaining_profile = await db.scalar(
            EngineerProfile.__table__.select().where(EngineerProfile.user_id == target_id)
        )
        assert remaining_profile is None

    logs = await client.get("/api/v1/admin/activity-logs", headers=headers)
    assert logs.status_code == 200
    assert any(log["action"] == "USER_DELETED" for log in logs.json())

    # Deleting a nonexistent user 404s cleanly rather than 500ing
    again = await client.delete(f"/api/v1/admin/users/{target_id}", headers=headers)
    assert again.status_code == 404
