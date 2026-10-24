"""Support tickets: requester isolation, staff-only queue, internal notes, SLA, concurrency, audit."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.admin.models import AuditEvent
from app.domains.auth.models import User, UserRole
from app.domains.support.models import SupportTicket


async def _register(client: AsyncClient, db: AsyncSession, admin: bool = False) -> tuple[uuid.UUID, dict[str, str]]:
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": f"s_{uuid.uuid4().hex[:8]}@test.com", "password": "Password123!",
              "full_name": "Support User", "role": "ENGINEER"},
    )
    body = res.json()
    uid = uuid.UUID(body["user"]["id"])
    if admin:
        user = await db.get(User, uid)
        user.role = UserRole.ADMIN
        await db.commit()
    return uid, {"Authorization": f"Bearer {body['access_token']}"}


TICKET = {"subject": "Cannot sign contract", "category": "CONTRACT", "body": "The sign button errors."}


@pytest.mark.asyncio
async def test_requester_flow_and_isolation(client: AsyncClient, db: AsyncSession):
    _, uh = await _register(client, db)
    _, other_h = await _register(client, db)
    res = await client.post("/api/v1/support/tickets", json=TICKET, headers=uh)
    assert res.status_code == 201, res.text
    t = res.json()["ticket"]
    assert t["severity"] == "NORMAL"
    assert "assignee_id" not in t

    assert (await client.get(f"/api/v1/support/tickets/{t['id']}", headers=other_h)).status_code == 404
    assert (await client.post(f"/api/v1/support/tickets/{t['id']}/messages", json={"body": "x"}, headers=other_h)).status_code == 404
    # Ordinary users cannot reach the staff queue.
    assert (await client.get("/api/v1/admin/support/tickets", headers=uh)).status_code == 403
    assert (await client.get(f"/api/v1/admin/support/tickets/{t['id']}", headers=uh)).status_code == 403

    closed = await client.post(f"/api/v1/support/tickets/{t['id']}/close", headers=uh)
    assert closed.json()["status"] == "CLOSED"
    assert (await client.post(f"/api/v1/support/tickets/{t['id']}/messages", json={"body": "x"}, headers=uh)).status_code == 409


@pytest.mark.asyncio
async def test_safety_reports_start_high(client: AsyncClient, db: AsyncSession):
    _, uh = await _register(client, db)
    t = (await client.post("/api/v1/support/tickets", json=TICKET | {"category": "SAFETY"}, headers=uh)).json()["ticket"]
    assert t["severity"] == "HIGH"


@pytest.mark.asyncio
async def test_staff_handling(client: AsyncClient, db: AsyncSession):
    _, uh = await _register(client, db)
    admin_id, ah = await _register(client, db, admin=True)
    t = (await client.post("/api/v1/support/tickets", json=TICKET, headers=uh)).json()["ticket"]
    base = f"/api/v1/admin/support/tickets/{t['id']}"

    queue = await client.get("/api/v1/admin/support/tickets?status=active&assignee=none", headers=ah)
    assert queue.headers["X-Total-Count"] == "1"
    version = queue.json()[0]["version"]

    # Internal note is hidden from the requester and does not count as a response.
    note = await client.post(f"{base}/messages", json={"body": "Looks like a 500 in sign", "internal": True}, headers=ah)
    assert note.json()["ticket"]["first_response_at"] is None
    reply = await client.post(f"{base}/messages", json={"body": "We are on it."}, headers=ah)
    assert reply.json()["ticket"]["status"] == "IN_PROGRESS"
    assert reply.json()["ticket"]["first_response_at"] is not None
    mine = (await client.get(f"/api/v1/support/tickets/{t['id']}", headers=uh)).json()
    assert [m["body"] for m in mine["messages"]] == [TICKET["body"], "We are on it."]
    assert mine["messages"][1]["from_staff"] is True

    version = reply.json()["ticket"]["version"]
    stale = await client.patch(base, json={"expected_version": version - 1, "reason": "triage", "severity": "HIGH"}, headers=ah)
    assert stale.status_code == 409
    no_reason = await client.patch(base, json={"expected_version": version, "reason": "", "severity": "HIGH"}, headers=ah)
    assert no_reason.status_code == 422
    # Only staff can be assignees.
    bad_assign = await client.patch(
        base, json={"expected_version": version, "reason": "own it", "assignee_id": t["requester_id"]}, headers=ah
    )
    assert bad_assign.status_code == 422
    ok = await client.patch(
        base,
        json={"expected_version": version, "reason": "triage", "severity": "URGENT", "assignee_id": str(admin_id), "status": "RESOLVED"},
        headers=ah,
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["ticket"]["status"] == "RESOLVED"
    assert ok.json()["ticket"]["resolved_at"] is not None

    audit = (await db.execute(select(AuditEvent).where(AuditEvent.action == "support.ticket.update"))).scalars().all()
    assert len(audit) == 1
    assert audit[0].actor_id == admin_id

    # Requester replying reopens a resolved ticket.
    again = await client.post(f"/api/v1/support/tickets/{t['id']}/messages", json={"body": "Still broken"}, headers=uh)
    assert again.json()["ticket"]["status"] == "OPEN"


@pytest.mark.asyncio
async def test_overdue_filter(client: AsyncClient, db: AsyncSession):
    _, uh = await _register(client, db)
    _, ah = await _register(client, db, admin=True)
    t = (await client.post("/api/v1/support/tickets", json=TICKET, headers=uh)).json()["ticket"]
    row = await db.get(SupportTicket, uuid.UUID(t["id"]))
    row.sla_due_at = datetime.now(UTC) - timedelta(minutes=1)
    await db.commit()
    res = await client.get("/api/v1/admin/support/tickets?overdue=true", headers=ah)
    assert len(res.json()) == 1
    assert res.json()[0]["overdue"] is True


@pytest.mark.asyncio
async def test_open_ticket_cap(client: AsyncClient, db: AsyncSession):
    _, uh = await _register(client, db)
    for _ in range(10):
        assert (await client.post("/api/v1/support/tickets", json=TICKET, headers=uh)).status_code == 201
    assert (await client.post("/api/v1/support/tickets", json=TICKET, headers=uh)).status_code == 429
