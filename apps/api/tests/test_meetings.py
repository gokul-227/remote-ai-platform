"""Meetings: invitation eligibility, visibility, join window, responses, cancellation."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.meetings.models import Meeting
from app.domains.network.models import Connection, UserBlock


async def _register(client: AsyncClient, role: str = "ENGINEER") -> tuple[uuid.UUID, dict[str, str]]:
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": f"m_{uuid.uuid4().hex[:8]}@test.com", "password": "Password123!",
              "full_name": "Meeting User", "role": role},
    )
    body = res.json()
    return uuid.UUID(body["user"]["id"]), {"Authorization": f"Bearer {body['access_token']}"}


async def _connect(db: AsyncSession, a: uuid.UUID, b: uuid.UUID) -> None:
    db.add(Connection(sender_id=a, receiver_id=b, status="ACCEPTED"))
    await db.commit()


def _payload(invitees: list[uuid.UUID], start_in: timedelta = timedelta(days=1), **extra) -> dict:
    start = datetime.now(UTC) + start_in
    return {
        "title": "Kickoff",
        "starts_at": start.isoformat(),
        "ends_at": (start + timedelta(hours=1)).isoformat(),
        "participant_ids": [str(i) for i in invitees],
        **extra,
    }


@pytest.mark.asyncio
async def test_schedule_respond_and_visibility(client: AsyncClient, db: AsyncSession):
    a, ah = await _register(client)
    b, bh = await _register(client)
    _, outsider_h = await _register(client)
    await _connect(db, a, b)

    res = await client.post("/api/v1/meetings", json=_payload([b]), headers=ah)
    assert res.status_code == 201, res.text
    m = res.json()
    assert m["provider"] == "JITSI"
    assert m["phase"] == "UPCOMING"
    assert "join_url" not in m
    assert [p["response"] for p in m["participants"]] == ["INVITED"]

    assert len((await client.get("/api/v1/meetings", headers=bh)).json()) == 1
    assert (await client.get(f"/api/v1/meetings/{m['id']}", headers=outsider_h)).status_code == 404
    assert (await client.get(f"/api/v1/meetings/{m['id']}/join", headers=outsider_h)).status_code == 404

    accepted = await client.post(f"/api/v1/meetings/{m['id']}/respond", json={"response": "ACCEPTED"}, headers=bh)
    assert accepted.json()["participants"][0]["response"] == "ACCEPTED"
    # Too early to join: link withheld.
    assert (await client.get(f"/api/v1/meetings/{m['id']}/join", headers=bh)).status_code == 409


@pytest.mark.asyncio
async def test_join_window_and_declined(client: AsyncClient, db: AsyncSession):
    a, ah = await _register(client)
    b, bh = await _register(client)
    await _connect(db, a, b)
    m = (await client.post("/api/v1/meetings", json=_payload([b], start_in=timedelta(minutes=10)), headers=ah)).json()

    join = await client.get(f"/api/v1/meetings/{m['id']}/join", headers=bh)
    assert join.status_code == 200
    assert join.json()["url"].startswith("https://meet.jit.si/RemoteAI-")
    assert (await client.get(f"/api/v1/meetings/{m['id']}/join", headers=ah)).status_code == 200

    await client.post(f"/api/v1/meetings/{m['id']}/respond", json={"response": "DECLINED"}, headers=bh)
    assert (await client.get(f"/api/v1/meetings/{m['id']}/join", headers=bh)).status_code == 409

    # Ended meeting.
    row = await db.get(Meeting, uuid.UUID(m["id"]))
    row.starts_at = datetime.now(UTC) - timedelta(hours=3)
    row.ends_at = datetime.now(UTC) - timedelta(hours=2)
    await db.commit()
    assert (await client.get(f"/api/v1/meetings/{m['id']}/join", headers=ah)).status_code == 409


@pytest.mark.asyncio
async def test_cancel_only_by_organiser(client: AsyncClient, db: AsyncSession):
    a, ah = await _register(client)
    b, bh = await _register(client)
    await _connect(db, a, b)
    m = (await client.post("/api/v1/meetings", json=_payload([b], start_in=timedelta(minutes=5)), headers=ah)).json()
    assert (await client.post(f"/api/v1/meetings/{m['id']}/cancel", headers=bh)).status_code == 403
    assert (await client.post(f"/api/v1/meetings/{m['id']}/cancel", headers=ah)).json()["status"] == "CANCELLED"
    assert (await client.get(f"/api/v1/meetings/{m['id']}/join", headers=bh)).status_code == 409
    assert (await client.post(f"/api/v1/meetings/{m['id']}/respond", json={"response": "ACCEPTED"}, headers=bh)).status_code == 409


@pytest.mark.asyncio
async def test_invite_eligibility(client: AsyncClient, db: AsyncSession):
    a, ah = await _register(client)
    stranger, _ = await _register(client)
    blocked, _ = await _register(client)
    await _connect(db, a, blocked)
    db.add(UserBlock(blocker_id=blocked, blocked_id=a))
    await db.commit()

    for target in (stranger, blocked, uuid.uuid4()):
        res = await client.post("/api/v1/meetings", json=_payload([target]), headers=ah)
        assert res.status_code == 422
    assert (await client.post("/api/v1/meetings", json=_payload([a]), headers=ah)).status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("extra", "ok"),
    [
        ({"external_url": "https://zoom.example.com/j/123"}, True),
        ({"external_url": "http://zoom.example.com/j/123"}, False),
        ({"external_url": "javascript:alert(1)"}, False),
        ({"external_url": "https://127.0.0.1/x"}, False),
    ],
)
async def test_external_links(client: AsyncClient, db: AsyncSession, extra: dict, ok: bool):
    a, ah = await _register(client)
    b, _ = await _register(client)
    await _connect(db, a, b)
    res = await client.post("/api/v1/meetings", json=_payload([b], **extra), headers=ah)
    assert res.status_code == (201 if ok else 422)
    if ok:
        assert res.json()["provider"] == "EXTERNAL"


@pytest.mark.asyncio
async def test_time_rules(client: AsyncClient, db: AsyncSession):
    a, ah = await _register(client)
    b, _ = await _register(client)
    await _connect(db, a, b)
    start = datetime.now(UTC) + timedelta(days=1)
    for starts, ends in [
        (start, start - timedelta(minutes=1)),
        (start, start + timedelta(hours=9)),
        (start - timedelta(days=3), start - timedelta(days=2)),
    ]:
        body = _payload([b]) | {"starts_at": starts.isoformat(), "ends_at": ends.isoformat()}
        assert (await client.post("/api/v1/meetings", json=body, headers=ah)).status_code == 422
    naive = _payload([b]) | {"starts_at": "2030-01-01T10:00:00", "ends_at": "2030-01-01T11:00:00"}
    assert (await client.post("/api/v1/meetings", json=naive, headers=ah)).status_code == 422


@pytest.mark.asyncio
async def test_call_signalling_is_private_to_participants(client: AsyncClient, db: AsyncSession):
    a, ah = await _register(client)
    b, bh = await _register(client)
    c, ch = await _register(client)
    await _connect(db, a, b)
    m = (await client.post("/api/v1/meetings", json=_payload([b], start_in=timedelta(minutes=5)), headers=ah)).json()
    base = f"/api/v1/meetings/{m['id']}/signals"

    assert (await client.post(base, json={"kind": "JOIN"}, headers=ah)).status_code == 201
    got = (await client.get(base, headers=bh)).json()
    assert [s["kind"] for s in got["signals"]] == ["JOIN"]
    assert got["ice_servers"][0]["urls"][0].startswith("stun:")
    offer = {"kind": "OFFER", "to_user_id": str(a), "payload": {"sdp": "v=0", "type": "offer"}}
    assert (await client.post(base, json=offer, headers=bh)).status_code == 201
    # The organiser sees the offer addressed to them; nobody sees their own signals.
    mine = (await client.get(base, headers=ah)).json()["signals"]
    assert [s["kind"] for s in mine] == ["OFFER"]
    # Outsiders and people outside the meeting can't use it.
    assert (await client.get(base, headers=ch)).status_code == 404
    assert (await client.post(base, json={"kind": "OFFER", "to_user_id": str(c), "payload": {}}, headers=ah)).status_code == 422
    assert (await client.post(base, json={"kind": "OFFER", "payload": {}}, headers=ah)).status_code == 422
    big = {"kind": "ICE", "to_user_id": str(b), "payload": {"x": "y" * 20_000}}
    assert (await client.post(base, json=big, headers=ah)).status_code == 422
    # Cursor: nothing new after the last id.
    cur = got["cursor"]
    assert (await client.get(base, params={"after": 10**9}, headers=bh)).json()["signals"] == []
    assert cur >= 1


@pytest.mark.asyncio
async def test_call_closed_outside_join_window(client: AsyncClient, db: AsyncSession):
    a, ah = await _register(client)
    b, _ = await _register(client)
    await _connect(db, a, b)
    m = (await client.post("/api/v1/meetings", json=_payload([b]), headers=ah)).json()
    assert (await client.post(f"/api/v1/meetings/{m['id']}/signals", json={"kind": "JOIN"}, headers=ah)).status_code == 409
