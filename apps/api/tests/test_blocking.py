"""Phase 06 networking: blocking someone stops all contact, and only the
person who blocked can lift it."""

import uuid

import pytest
from auth_support import token_for
from httpx import AsyncClient
from sqlalchemy import select


async def _user(client: AsyncClient):
    from conftest import TestingSessionLocal

    from app.domains.auth.models import User

    email = f"b-{uuid.uuid4().hex[:8]}@example.com"
    await client.post("/api/v1/auth/register", json={"email": email, "password": "p", "full_name": "B", "role": "ENGINEER"})
    async with TestingSessionLocal() as db:
        return await db.scalar(select(User).where(User.email == email))


def _h(u) -> dict:
    return {"Authorization": f"Bearer {token_for(u)}"}


@pytest.mark.asyncio
async def test_blocking_stops_messages_requests_and_conversations_both_ways(client: AsyncClient):
    alice, bob = await _user(client), await _user(client)
    conv = (await client.post("/api/v1/conversations", headers=_h(bob), json={"participant_id": str(alice.id)})).json()
    connection = await client.post("/api/v1/connections", headers=_h(bob), json={"receiver_id": str(alice.id)})
    assert connection.status_code == 201

    assert (await client.post("/api/v1/blocks", headers=_h(alice), json={"user_id": str(bob.id)})).status_code == 201

    for who, other in ((bob, alice), (alice, bob)):
        send = await client.post(f"/api/v1/conversations/{conv['id']}/messages", headers=_h(who), json={"content": "hi"})
        assert send.status_code == 403
        start = await client.post("/api/v1/conversations", headers=_h(who), json={"participant_id": str(other.id)})
        assert start.status_code == 403
        request = await client.post("/api/v1/connections", headers=_h(who), json={"receiver_id": str(other.id)})
        assert request.status_code == 403
    # Blocking removed the pending connection; neither side sees it.
    assert (await client.get("/api/v1/connections", headers=_h(alice))).json() == []


@pytest.mark.asyncio
async def test_only_the_blocker_can_unblock(client: AsyncClient):
    alice, bob = await _user(client), await _user(client)
    await client.post("/api/v1/blocks", headers=_h(alice), json={"user_id": str(bob.id)})
    assert (await client.delete(f"/api/v1/blocks/{alice.id}", headers=_h(bob))).status_code == 404
    assert [b["user_id"] for b in (await client.get("/api/v1/blocks", headers=_h(alice))).json()] == [str(bob.id)]
    assert (await client.get("/api/v1/blocks", headers=_h(bob))).json() == []  # never reveals who blocked you

    assert (await client.delete(f"/api/v1/blocks/{bob.id}", headers=_h(alice))).status_code == 204
    assert (await client.post("/api/v1/connections", headers=_h(bob), json={"receiver_id": str(alice.id)})).status_code == 201


@pytest.mark.asyncio
async def test_cannot_block_yourself_or_nobody(client: AsyncClient):
    alice = await _user(client)
    assert (await client.post("/api/v1/blocks", headers=_h(alice), json={"user_id": str(alice.id)})).status_code == 400
    assert (await client.post("/api/v1/blocks", headers=_h(alice), json={"user_id": str(uuid.uuid4())})).status_code == 400
