"""Least-privilege staff roles and staff feature-flag overrides."""

import uuid

import pytest
from auth_support import token_for
from conftest import TestingSessionLocal
from httpx import AsyncClient

from app.core import feature_flags
from app.domains.admin.staff import StaffRole, allowed, area_of
from app.domains.auth.models import User, UserRole


async def _admin(roles: list[str] | None = None) -> tuple[dict[str, str], uuid.UUID]:
    async with TestingSessionLocal() as db:
        user = User(
            email=f"staff-{uuid.uuid4().hex[:6]}@example.com",
            full_name="Staff",
            role=UserRole.ADMIN,
        )
        db.add(user)
        await db.flush()
        for r in roles or []:
            db.add(StaffRole(user_id=user.id, role=r))
        token = token_for(user)
        await db.commit()
        return {"Authorization": f"Bearer {token}"}, user.id


def test_area_mapping():
    assert area_of("/api/v1/admin/users/abc/status") == "users"
    assert area_of("/api/v1/admin/background/runs") == "background"
    assert area_of("/api/v1/moderation/reports") == "moderation"
    assert area_of("/api/v1/jobs/sync") == "jobs"
    assert allowed({"auditor"}, "users", "GET") is True
    assert allowed({"auditor"}, "users", "PATCH") is False
    assert allowed({"auditor"}, "staff-roles", "GET") is False
    assert allowed({"support"}, "support", "POST") is True
    assert allowed({"support"}, "moderation", "GET") is False
    assert allowed({"moderator"}, "trust", "PATCH") is True
    assert allowed({"eng_operator"}, "background", "POST") is True
    assert allowed({"eng_operator"}, "users", "PATCH") is False
    assert allowed({"ops_admin"}, "users", "PATCH") is True
    assert allowed({"ops_admin"}, "staff-roles", "PUT") is False


@pytest.mark.asyncio
async def test_roles_limit_real_endpoints(client: AsyncClient, engineer_token: str):
    member = {"Authorization": f"Bearer {engineer_token}"}
    implicit, _ = await _admin()  # no rows: full access (existing staff keep working)
    support, _ = await _admin(["support"])
    moderator, _ = await _admin(["moderator"])
    engineer, _ = await _admin(["eng_operator"])
    auditor, _ = await _admin(["auditor"])

    for h in (implicit, support, moderator, engineer, auditor):
        assert (
            await client.get("/api/v1/admin/stats", headers=h)
        ).status_code == 200  # shared overview
    assert (await client.get("/api/v1/admin/stats", headers=member)).status_code == 403

    assert (await client.get("/api/v1/admin/users", headers=support)).status_code == 200
    assert (await client.get("/api/v1/admin/users", headers=moderator)).status_code == 403
    assert (await client.get("/api/v1/moderation/reports", headers=moderator)).status_code == 200
    assert (await client.get("/api/v1/moderation/reports", headers=support)).status_code == 403
    assert (
        await client.get("/api/v1/admin/background/overview", headers=engineer)
    ).status_code == 200
    assert (
        await client.get("/api/v1/admin/background/overview", headers=support)
    ).status_code == 403

    # Auditor reads everything, changes nothing.
    assert (await client.get("/api/v1/admin/users", headers=auditor)).status_code == 200
    assert (await client.get("/api/v1/moderation/reports", headers=auditor)).status_code == 200
    target = (await client.get("/api/v1/admin/users", headers=implicit)).json()[0]["id"]
    assert (
        await client.patch(
            f"/api/v1/admin/users/{target}/status", headers=auditor, json={"is_active": False}
        )
    ).status_code == 403


@pytest.mark.asyncio
async def test_only_super_admins_manage_staff_roles_and_changes_are_audited(client: AsyncClient):
    boss, boss_id = await _admin()
    ops, ops_id = await _admin(["ops_admin"])
    _, member_admin_id = await _admin()

    assert (await client.get("/api/v1/admin/staff-roles", headers=ops)).status_code == 403
    assert (
        await client.put(
            f"/api/v1/admin/staff-roles/{member_admin_id}",
            headers=ops,
            json={"roles": ["auditor"], "reason": "x y z"},
        )
    ).status_code == 403
    listing = (await client.get("/api/v1/admin/staff-roles", headers=boss)).json()
    assert {r["user_id"] for r in listing} >= {str(boss_id), str(ops_id), str(member_admin_id)}

    bad = await client.put(
        f"/api/v1/admin/staff-roles/{member_admin_id}",
        headers=boss,
        json={"roles": ["god"], "reason": "test"},
    )
    assert bad.status_code == 422
    no_reason = await client.put(
        f"/api/v1/admin/staff-roles/{member_admin_id}", headers=boss, json={"roles": ["auditor"]}
    )
    assert no_reason.status_code == 422
    ok = await client.put(
        f"/api/v1/admin/staff-roles/{member_admin_id}",
        headers=boss,
        json={"roles": ["auditor"], "reason": "quarterly audit"},
    )
    assert ok.json()["roles"] == ["auditor"]
    lockout = await client.put(
        f"/api/v1/admin/staff-roles/{boss_id}",
        headers=boss,
        json={"roles": ["auditor"], "reason": "oops"},
    )
    assert lockout.status_code == 409
    members = await client.post(
        "/api/v1/auth/register", json={"email": "plain@example.com", "full_name": "Plain"}
    )
    plain_id = members.json()["user"]["id"]
    assert (
        await client.put(
            f"/api/v1/admin/staff-roles/{plain_id}",
            headers=boss,
            json={"roles": ["support"], "reason": "not staff"},
        )
    ).status_code == 404  # roles never turn a member into staff

    audit = (await client.get("/api/v1/admin/audit-events?limit=50", headers=boss)).json()
    entry = next(e for e in audit if e["action"] == "staff.roles.update")
    assert entry["resource_id"] == str(member_admin_id)

    me = (await client.get("/api/v1/admin/me/permissions", headers=ops)).json()
    assert me == {"roles": ["ops_admin"], "implicit_super_admin": False}


@pytest.mark.asyncio
async def test_feature_flag_overrides(client: AsyncClient, monkeypatch):
    from app.core.config import settings

    feature_flags.set_overrides({})
    monkeypatch.setattr(settings, "FEATURE_REALTIME_WEBSOCKETS", False)
    boss, _ = await _admin()
    support, _ = await _admin(["support"])
    state = {
        f["name"]: f
        for f in (await client.get("/api/v1/admin/feature-flags/state", headers=support)).json()
    }
    assert state["realtime_websockets"]["effective"] is False
    assert state["realtime_websockets"]["override"] is None
    denied = await client.put(
        "/api/v1/admin/feature-flags/realtime_websockets",
        headers=support,
        json={"enabled": True, "reason": "try"},
    )
    assert denied.status_code == 403
    assert (
        await client.put(
            "/api/v1/admin/feature-flags/nope",
            headers=boss,
            json={"enabled": True, "reason": "x y"},
        )
    ).status_code == 404
    on = await client.put(
        "/api/v1/admin/feature-flags/realtime_websockets",
        headers=boss,
        json={"enabled": True, "reason": "load test passed"},
    )
    assert on.json()["effective"] is True
    assert feature_flags.is_feature_enabled("realtime_websockets") is True
    cleared = await client.put(
        "/api/v1/admin/feature-flags/realtime_websockets",
        headers=boss,
        json={"enabled": None, "reason": "back to env"},
    )
    assert cleared.json()["effective"] is False
    audit = (await client.get("/api/v1/admin/audit-events?limit=50", headers=boss)).json()
    assert sum(1 for e in audit if e["action"] == "feature_flag.update") == 2
    feature_flags.set_overrides({})
