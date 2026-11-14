"""Incident API security and atomic audit lifecycle, independent of main wiring."""

import uuid

import pytest
from auth_support import token_for
from conftest import TestingSessionLocal, override_get_db
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.core.database import get_db
from app.domains.admin import incident_router
from app.domains.admin.incident_models import Incident
from app.domains.admin.models import AuditEvent
from app.domains.auth.models import User, UserRole


@pytest.fixture
async def incidents_client():
    app = FastAPI()
    app.include_router(incident_router.router, prefix="/api/v1")
    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def headers(role=UserRole.ADMIN, active=True):
    async with TestingSessionLocal() as db:
        user = User(
            email=f"{uuid.uuid4()}@example.com",
            full_name="Staff tester",
            role=role,
            is_active=active,
        )
        db.add(user)
        await db.flush()
        token = token_for(user)
        await db.commit()
        return {"Authorization": f"Bearer {token}"}, str(user.id)


BODY = {
    "title": "Queue delayed",
    "description": "Imports stalled",
    "service": "imports",
    "severity": "SEV2",
    "reason": "Monitoring alert",
}
ROOT = "/api/v1/admin/incidents"


@pytest.mark.parametrize("role", [None, UserRole.ENGINEER, UserRole.COMPANY])
async def test_all_incident_routes_deny_public_and_members(incidents_client, role):
    auth = (await headers(role))[0] if role else {}
    item = str(uuid.uuid4())
    for method, path, body in [
        ("GET", ROOT, None),
        ("POST", ROOT, BODY),
        ("GET", f"{ROOT}/{item}", None),
        ("PATCH", f"{ROOT}/{item}", {"version": 1, "status": "ACKNOWLEDGED", "reason": "triage"}),
        ("GET", f"{ROOT}/{item}/activity", None),
        ("POST", f"{ROOT}/{item}/notes", {"body": "note", "reason": "triage"}),
    ]:
        response = await incidents_client.request(method, path, headers=auth, json=body)
        assert response.status_code == (403 if role else 401), response.text


async def test_lifecycle_assignment_filter_pagination_and_audit(incidents_client):
    client = incidents_client
    auth, uid = await headers()
    response = await client.post(ROOT, headers=auth, json={**BODY, "assignee_id": uid})
    assert response.status_code == 201, response.text
    item = response.json()
    path = f"{ROOT}/{item['id']}"
    assert item["version"] == 1
    assert item["status"] == "OPEN"
    for version, status in enumerate(
        ["ACKNOWLEDGED", "INVESTIGATING", "MONITORING", "RESOLVED", "OPEN"], 1
    ):
        response = await client.patch(
            path,
            headers=auth,
            json={"version": version, "status": status, "reason": "Operational update"},
        )
        assert response.status_code == 200, response.text
        assert bool(response.json()["resolved_at"]) == (status == "RESOLVED")
    response = await client.patch(
        path,
        headers=auth,
        json={"version": 6, "severity": "SEV1", "assignee_id": None, "reason": "Escalate incident"},
    )
    assert response.status_code == 200
    assert response.json()["assignee_id"] is None
    assert (
        await client.post(
            f"{path}/notes",
            headers=auth,
            json={"body": "Provider contacted", "reason": "Investigation"},
        )
    ).status_code == 201
    assert len((await client.get(ROOT + "?severity=SEV1&status=OPEN", headers=auth)).json()) == 1
    assert (await client.get(ROOT + "?status=RESOLVED", headers=auth)).json() == []
    assert (await client.get(ROOT + "?offset=1", headers=auth)).json() == []
    events = (await client.get(f"{path}/activity", headers=auth)).json()
    assert len(events) == 8
    assert {e["action"] for e in events} == {
        "admin.incident.create",
        "admin.incident.update",
        "admin.incident.note",
    }
    assert all(e["actor_id"] == uid and e["payload"]["reason"] for e in events)
    assert len((await client.get(f"{path}/activity?offset=1&limit=2", headers=auth)).json()) == 2
    stale = await client.patch(
        path, headers=auth, json={"version": 1, "severity": "SEV4", "reason": "Stale write"}
    )
    assert stale.status_code == 409
    invalid = await client.patch(
        path, headers=auth, json={"version": 7, "status": "RESOLVED", "reason": "Skip triage"}
    )
    assert invalid.status_code == 409
    assert len((await client.get(f"{path}/activity", headers=auth)).json()) == 8


async def test_validation_missing_objects_and_inactive_staff(incidents_client):
    client = incidents_client
    auth, _ = await headers()
    for changes in [{"reason": "  "}, {"title": " "}, {"severity": "urgent"}, {"unexpected": True}]:
        assert (await client.post(ROOT, headers=auth, json={**BODY, **changes})).status_code == 422
    for role, active in [(UserRole.ENGINEER, True), (UserRole.ADMIN, False)]:
        _, uid = await headers(role, active)
        assert (
            await client.post(ROOT, headers=auth, json={**BODY, "assignee_id": uid})
        ).status_code == 422
    assert (
        await client.post(ROOT, headers=auth, json={**BODY, "assignee_id": str(uuid.uuid4())})
    ).status_code == 422
    response = await client.post(ROOT, headers=auth, json=BODY)
    path = f"{ROOT}/{response.json()['id']}"
    for changes in [{}, {"status": None}, {"severity": None}, {"version": 0}]:
        assert (
            await client.patch(path, headers=auth, json={"version": 1, "reason": "test", **changes})
        ).status_code == 422
    assert (
        await client.post(path + "/notes", headers=auth, json={"body": " ", "reason": "test"})
    ).status_code == 422
    for suffix in ["", "/activity"]:
        assert (await client.get(f"{ROOT}/{uuid.uuid4()}{suffix}", headers=auth)).status_code == 404
    for query in ["limit=101", "offset=-1", "severity=bad", "status=bad"]:
        assert (await client.get(ROOT + "?" + query, headers=auth)).status_code == 422
    disabled, _ = await headers(active=False)
    assert (await client.get(ROOT, headers=disabled)).status_code in (401, 403)


async def test_audit_failure_rolls_back_incident_create_and_update(incidents_client, monkeypatch):
    auth, _ = await headers()
    response = await incidents_client.post(ROOT, headers=auth, json=BODY)
    iid = response.json()["id"]

    async def fail(*args, **kwargs):
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr(incident_router, "record_audit_event", fail)
    with pytest.raises(RuntimeError, match="audit unavailable"):
        await incidents_client.patch(
            f"{ROOT}/{iid}",
            headers=auth,
            json={"version": 1, "status": "ACKNOWLEDGED", "reason": "triage"},
        )
    with pytest.raises(RuntimeError, match="audit unavailable"):
        await incidents_client.post(ROOT, headers=auth, json=BODY)
    async with TestingSessionLocal() as db:
        item = await db.get(Incident, uuid.UUID(iid))
        assert item.version == 1
        assert item.status == "OPEN"
        assert await db.scalar(select(func.count()).select_from(Incident)) == 1
        assert (
            await db.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(AuditEvent.resource_type == "incident")
            )
            == 1
        )


async def test_coordinator_main_mount_requires_staff(client, engineer_token):
    """Integration contract for the coordinator-owned main.py mount."""
    assert (await client.get(ROOT)).status_code == 401
    assert (
        await client.get(ROOT, headers={"Authorization": f"Bearer {engineer_token}"})
    ).status_code == 403
    auth, _ = await headers()
    assert (await client.get(ROOT, headers=auth)).status_code == 200
