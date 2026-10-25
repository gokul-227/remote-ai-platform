"""Staff console operations: announcements, contract oversight, assistant activity, filters."""

import uuid

import pytest
from auth_support import token_for
from conftest import TestingSessionLocal
from httpx import AsyncClient

from app.domains.auth.models import User, UserRole


async def _headers(role: UserRole) -> dict[str, str]:
    async with TestingSessionLocal() as db:
        user = User(email=f"ops-{uuid.uuid4().hex[:8]}@example.com", full_name="Ops", role=role)
        db.add(user)
        await db.commit()
        return {"Authorization": f"Bearer {token_for(user)}"}


@pytest.mark.asyncio
async def test_announcements_lifecycle_is_staff_only_and_audited(client: AsyncClient):
    admin = await _headers(UserRole.ADMIN)
    member = await _headers(UserRole.ENGINEER)
    body = {"title": "Maintenance", "body": "Short downtime tonight.", "severity": "WARNING"}
    assert (
        await client.post("/api/v1/admin/announcements", json=body, headers=member)
    ).status_code == 403
    created = await client.post("/api/v1/admin/announcements", json=body, headers=admin)
    assert created.status_code == 201
    item = created.json()
    active = await client.get("/api/v1/announcements/active", headers=member)
    assert [a["id"] for a in active.json()] == [item["id"]]
    off = await client.patch(
        f"/api/v1/admin/announcements/{item['id']}", json={"active": False}, headers=admin
    )
    assert off.json()["active"] is False
    assert (await client.get("/api/v1/announcements/active", headers=member)).json() == []
    audit = await client.get(
        "/api/v1/admin/audit-events?action_prefix=admin.announcement", headers=admin
    )
    assert {e["action"] for e in audit.json()} == {
        "admin.announcement.create",
        "admin.announcement.update",
    }


@pytest.mark.asyncio
async def test_announcement_end_must_follow_start(client: AsyncClient):
    admin = await _headers(UserRole.ADMIN)
    bad = {
        "title": "x",
        "body": "y",
        "starts_at": "2030-01-02T00:00:00Z",
        "ends_at": "2030-01-01T00:00:00Z",
    }
    assert (
        await client.post("/api/v1/admin/announcements", json=bad, headers=admin)
    ).status_code == 422


@pytest.mark.asyncio
async def test_contracts_and_assistant_activity_require_staff(client: AsyncClient):
    admin = await _headers(UserRole.ADMIN)
    member = await _headers(UserRole.ENGINEER)
    for path in ("/api/v1/admin/contracts", "/api/v1/admin/assistant-actions"):
        assert (await client.get(path, headers=member)).status_code == 403
        r = await client.get(path, headers=admin)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_users_can_be_filtered_to_suspended_accounts(client: AsyncClient):
    admin = await _headers(UserRole.ADMIN)
    async with TestingSessionLocal() as db:
        gone = User(
            email=f"sus-{uuid.uuid4().hex[:8]}@example.com",
            full_name="Suspended",
            role=UserRole.ENGINEER,
        )
        gone.is_active = False
        db.add(gone)
        await db.commit()
    rows = (await client.get("/api/v1/admin/users?is_active=false&limit=100", headers=admin)).json()
    assert rows
    assert all(not u["is_active"] for u in rows)


@pytest.mark.asyncio
async def test_audit_events_filter_on_several_prefixes(client: AsyncClient):
    admin = await _headers(UserRole.ADMIN)
    await client.post("/api/v1/admin/announcements", json={"title": "T", "body": "B"}, headers=admin)
    both = await client.get("/api/v1/admin/audit-events?action_prefix=admin.user.,admin.announcement", headers=admin)
    assert both.status_code == 200
    assert {e["action"] for e in both.json()} >= {"admin.announcement.create"}
    none = await client.get("/api/v1/admin/audit-events?action_prefix=nothing.here", headers=admin)
    assert none.json() == []


@pytest.mark.asyncio
async def test_usage_page_reports_counts_and_limits_to_staff_only(client: AsyncClient):
    admin = await _headers(UserRole.ADMIN)
    member = await _headers(UserRole.ENGINEER)
    assert (await client.get("/api/v1/admin/usage", headers=member)).status_code == 403
    body = (await client.get("/api/v1/admin/usage", headers=admin)).json()
    assert body["limits"]["database_bytes"] == 500 * 1024 * 1024
    assert body["users_total"] >= 2
    assert isinstance(body["jobs_by_source"], dict)
    assert "Resend (all emails incl. sign-in codes)" in body["dashboards"]


@pytest.mark.asyncio
async def test_search_status_is_staff_only_and_reports_unconfigured(client: AsyncClient, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "GOOGLE_INDEXING_CREDENTIALS_B64", None)
    admin = await _headers(UserRole.ADMIN)
    member = await _headers(UserRole.ENGINEER)
    assert (await client.get("/api/v1/admin/search-status", headers=member)).status_code == 403
    assert (await client.get("/api/v1/admin/search-status", headers=admin)).json() == {"configured": False}
