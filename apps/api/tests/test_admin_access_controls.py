"""Admin access management: reasons in the audit trail, self-lockout guards, session revocation."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.admin.models import AuditEvent
from app.domains.auth.models import User, UserRole


async def _user(client: AsyncClient, db: AsyncSession, admin: bool = False):
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": f"ac_{uuid.uuid4().hex[:8]}@test.com", "password": "Password123!", "full_name": "U", "role": "ENGINEER"},
    )
    body = res.json()
    uid = uuid.UUID(body["user"]["id"])
    if admin:
        u = await db.get(User, uid)
        u.role = UserRole.ADMIN
        await db.commit()
    return uid, {"Authorization": f"Bearer {body['access_token']}"}


@pytest.mark.asyncio
async def test_admin_cannot_lock_themselves_out(client: AsyncClient, db: AsyncSession):
    admin_id, ah = await _user(client, db, admin=True)
    assert (await client.patch(f"/api/v1/admin/users/{admin_id}/status", json={"is_active": False}, headers=ah)).status_code == 400
    assert (await client.patch(f"/api/v1/admin/users/{admin_id}/role", json={"role": "ENGINEER"}, headers=ah)).status_code == 400


@pytest.mark.asyncio
async def test_suspension_records_reason_and_ends_sessions(client: AsyncClient, db: AsyncSession):
    _, ah = await _user(client, db, admin=True)
    target, th = await _user(client, db)
    assert (await client.get("/api/v1/auth/me", headers=th)).status_code == 200
    res = await client.patch(f"/api/v1/admin/users/{target}/status", json={"is_active": False, "reason": "spam"}, headers=ah)
    assert res.status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=th)).status_code in (401, 403)
    event = (await db.execute(select(AuditEvent).where(AuditEvent.action == "admin.user.status"))).scalar_one()
    assert event.payload["reason"] == "spam"


@pytest.mark.asyncio
async def test_revoke_sessions(client: AsyncClient, db: AsyncSession):
    _, ah = await _user(client, db, admin=True)
    target, th = await _user(client, db)
    assert (await client.post(f"/api/v1/admin/users/{target}/revoke-sessions", json={"reason": ""}, headers=ah)).status_code == 422
    res = await client.post(f"/api/v1/admin/users/{target}/revoke-sessions", json={"reason": "lost laptop"}, headers=ah)
    assert res.status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=th)).status_code == 401
    # Ordinary users cannot call it.
    _, uh = await _user(client, db)
    assert (await client.post(f"/api/v1/admin/users/{target}/revoke-sessions", json={"reason": "x" * 5}, headers=uh)).status_code == 403
