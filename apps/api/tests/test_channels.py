"""Channels: membership-gated access, live project access, threads, mentions, unread, mute, retries."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.network.models import Connection
from app.domains.notifications.models import Notification


async def _user(client: AsyncClient, role: str = "ENGINEER"):
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": f"ch_{uuid.uuid4().hex[:8]}@test.com", "password": "Password123!", "full_name": "Chan", "role": role},
    )
    b = res.json()
    return uuid.UUID(b["user"]["id"]), {"Authorization": f"Bearer {b['access_token']}"}


async def _connect(db: AsyncSession, a, b):
    db.add(Connection(sender_id=a, receiver_id=b, status="ACCEPTED"))
    await db.commit()


@pytest.mark.asyncio
async def test_group_channel_flow(client: AsyncClient, db: AsyncSession):
    a, ah = await _user(client)
    b, bh = await _user(client)
    c, ch_h = await _user(client)
    await _connect(db, a, b)
    res = await client.post("/api/v1/channels", json={"kind": "GROUP", "name": "design", "member_ids": [str(b)]}, headers=ah)
    assert res.status_code == 201, res.text
    cid = res.json()["id"]
    # Not connected -> cannot be added; outsiders see nothing.
    assert (await client.post(f"/api/v1/channels/{cid}/members", json={"user_id": str(c)}, headers=ah)).status_code == 422
    assert (await client.get(f"/api/v1/channels/{cid}/messages", headers=ch_h)).status_code == 404
    assert (await client.post(f"/api/v1/channels/{cid}/messages", json={"body": "x"}, headers=ch_h)).status_code == 404

    m1 = await client.post(f"/api/v1/channels/{cid}/messages", json={"body": "hello @b", "mentions": [str(b)], "client_token": "tok-00000001"}, headers=ah)
    assert m1.status_code == 201
    retry = await client.post(f"/api/v1/channels/{cid}/messages", json={"body": "hello @b", "mentions": [str(b)], "client_token": "tok-00000001"}, headers=ah)
    assert retry.json()["id"] == m1.json()["id"]
    notes = (await db.execute(select(Notification).where(Notification.user_id == b))).scalars().all()
    assert len(notes) == 1

    mine = {x["id"]: x for x in (await client.get("/api/v1/channels", headers=bh)).json()}
    assert mine[cid]["unread"] == 1
    await client.post(f"/api/v1/channels/{cid}/read", headers=bh)
    assert {x["id"]: x for x in (await client.get("/api/v1/channels", headers=bh)).json()}[cid]["unread"] == 0

    # Threads.
    reply = await client.post(f"/api/v1/channels/{cid}/messages", json={"body": "reply", "parent_id": m1.json()["id"]}, headers=bh)
    assert reply.status_code == 201
    nested = await client.post(f"/api/v1/channels/{cid}/messages", json={"body": "x", "parent_id": reply.json()["id"]}, headers=bh)
    assert nested.status_code == 422
    roots = (await client.get(f"/api/v1/channels/{cid}/messages", headers=ah)).json()
    assert [r["reply_count"] for r in roots] == [1]
    assert len((await client.get(f"/api/v1/channels/{cid}/messages", params={"thread": m1.json()["id"]}, headers=ah)).json()) == 1

    # Removal takes effect immediately.
    assert (await client.delete(f"/api/v1/channels/{cid}/members/{b}", headers=bh)).status_code == 200
    assert (await client.get(f"/api/v1/channels/{cid}/messages", headers=bh)).status_code == 404


@pytest.mark.asyncio
async def test_project_channel_follows_project_access(client: AsyncClient):
    _, co = await _user(client, "COMPANY")
    await client.post("/api/v1/companies/me", headers=co, json={"name": "Chan Co"})
    pid = (await client.post("/api/v1/projects", headers=co, json={"title": "P", "description": "D"})).json()["id"]
    _, outsider = await _user(client)
    res = await client.post("/api/v1/channels", json={"kind": "PROJECT", "name": "general", "project_id": pid}, headers=co)
    assert res.status_code == 201
    cid = res.json()["id"]
    assert (await client.post("/api/v1/channels", json={"kind": "PROJECT", "name": "x", "project_id": pid}, headers=outsider)).status_code == 404
    assert (await client.get(f"/api/v1/channels/{cid}/messages", headers=outsider)).status_code == 404
    assert cid not in [c["id"] for c in (await client.get("/api/v1/channels", headers=outsider)).json()]
    assert (await client.post(f"/api/v1/channels/{cid}/mute", json={"muted": True}, headers=co)).json()["muted"] is True


@pytest.mark.asyncio
async def test_polling_after_cursor(client: AsyncClient, db: AsyncSession):
    a, ah = await _user(client)
    b, _ = await _user(client)
    await _connect(db, a, b)
    cid = (await client.post("/api/v1/channels", json={"kind": "GROUP", "name": "g", "member_ids": [str(b)]}, headers=ah)).json()["id"]
    first = (await client.post(f"/api/v1/channels/{cid}/messages", json={"body": "1"}, headers=ah)).json()
    await client.post(f"/api/v1/channels/{cid}/messages", json={"body": "2"}, headers=ah)
    newer = (await client.get(f"/api/v1/channels/{cid}/messages", params={"after": first["created_at"]}, headers=ah)).json()
    assert [m["body"] for m in newer] == ["2"]
