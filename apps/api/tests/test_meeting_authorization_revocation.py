"""Live meeting grants must respect revocation on every join and signal request."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from auth_support import token_for
from sqlalchemy import func, select

from app.domains.auth.models import User, UserRole
from app.domains.meetings.models import CallSignal
from app.domains.network.models import Connection, UserBlock


@pytest.fixture
async def meeting(client, db):
    users = [
        User(id=uuid.uuid4(), auth_subject=str(uuid.uuid4()),
             email=f"{uuid.uuid4().hex}@test.com", full_name="Meeting member",
             role=UserRole.ENGINEER, is_active=True)
        for _ in range(4)
    ]
    db.add_all(users)
    await db.flush()
    organizer, invitee, peer, outsider = users
    db.add_all([
        Connection(sender_id=organizer.id, receiver_id=user.id, status="ACCEPTED")
        for user in (invitee, peer)
    ])
    await db.commit()
    headers = [{"Authorization": f"Bearer {token_for(user)}"} for user in users]
    start = datetime.now(UTC) + timedelta(minutes=5)
    response = await client.post("/api/v1/meetings", headers=headers[0], json={
        "title": "Authorization regression",
        "starts_at": start.isoformat(),
        "ends_at": (start + timedelta(hours=1)).isoformat(),
        "participant_ids": [str(invitee.id), str(peer.id)],
    })
    assert response.status_code == 201, response.text
    return f"/api/v1/meetings/{response.json()['id']}", users, headers


@pytest.mark.parametrize("reverse", [False, True])
async def test_block_after_invitation_revokes_join_send_and_poll(client, db, meeting, reverse):
    base, users, headers = meeting
    assert (await client.get(f"{base}/join", headers=headers[1])).status_code == 200
    assert (await client.post(f"{base}/signals", headers=headers[1], json={"kind": "JOIN"})).status_code == 201
    first, second = (users[1], users[0]) if reverse else (users[0], users[1])
    block = UserBlock(blocker_id=first.id, blocked_id=second.id)
    db.add(block)
    await db.commit()

    for suffix in ("join", "signals"):
        assert (await client.get(f"{base}/{suffix}", headers=headers[1])).status_code == 404
    assert (await client.post(f"{base}/signals", headers=headers[1], json={"kind": "JOIN"})).status_code == 404
    # Organizer retains access; a stale broadcast from the revoked invitee is withheld.
    polled = await client.get(f"{base}/signals", headers=headers[0])
    assert polled.status_code == 200
    assert polled.json()["signals"] == []
    assert (await client.get(f"{base}/join", headers=headers[0])).status_code == 200

    await db.delete(block)
    await db.commit()
    assert (await client.get(f"{base}/join", headers=headers[1])).status_code == 200
    assert (await client.get(f"{base}/signals", headers=headers[1])).status_code == 200


@pytest.mark.parametrize("revocation", ["declined", "blocked", "removed"])
async def test_revoked_recipient_and_queued_sender_are_rejected(client, db, meeting, revocation):
    base, users, headers = meeting
    sent = await client.post(f"{base}/signals", headers=headers[1], json={"kind": "JOIN"})
    assert sent.status_code == 201
    if revocation == "declined":
        result = await client.post(f"{base}/respond", headers=headers[1], json={"response": "DECLINED"})
    elif revocation == "removed":
        result = await client.delete(f"{base}/participants/{users[1].id}", headers=headers[0])
    else:
        db.add(UserBlock(blocker_id=users[1].id, blocked_id=users[0].id))
        await db.commit()
        result = await client.get(base, headers=headers[0])
    assert result.status_code == 200
    count = await db.scalar(select(func.count()).select_from(CallSignal))
    # Check both the organizer and another invitee targeting a revoked recipient.
    for sender in (0, 2):
        for kind in ("OFFER", "ANSWER", "ICE", "JOIN", "LEAVE"):
            rejected = await client.post(f"{base}/signals", headers=headers[sender], json={
                "kind": kind, "to_user_id": str(users[1].id), "payload": {},
            })
            assert rejected.status_code == 422, rejected.text
        polled = await client.get(f"{base}/signals", headers=headers[sender])
        assert polled.status_code == 200
        assert polled.json()["signals"] == []
    assert await db.scalar(select(func.count()).select_from(CallSignal)) == count
    expected = 409 if revocation == "declined" else 404
    assert (await client.get(f"{base}/join", headers=headers[1])).status_code == expected
    assert (await client.get(f"{base}/signals", headers=headers[1])).status_code == expected
    assert (await client.post(f"{base}/signals", headers=headers[1], json={"kind": "JOIN"})).status_code == expected


@pytest.mark.parametrize("reverse", [False, True])
async def test_peer_block_prevents_direct_and_broadcast_delivery(client, db, meeting, reverse):
    base, users, headers = meeting
    for kind, target in (("JOIN", None), ("OFFER", str(users[2].id))):
        assert (await client.post(f"{base}/signals", headers=headers[1], json={
            "kind": kind, "to_user_id": target,
        })).status_code == 201
    first, second = (users[2], users[1]) if reverse else (users[1], users[2])
    db.add(UserBlock(blocker_id=first.id, blocked_id=second.id))
    await db.commit()
    for sender, target in ((1, 2), (2, 1)):
        assert (await client.post(f"{base}/signals", headers=headers[sender], json={
            "kind": "ICE", "to_user_id": str(users[target].id),
        })).status_code == 422
        assert (await client.get(f"{base}/join", headers=headers[sender])).status_code == 200
    polled = await client.get(f"{base}/signals", headers=headers[2])
    assert polled.status_code == 200
    assert polled.json()["signals"] == []
    # Other members can still receive the broadcast.
    assert len((await client.get(f"{base}/signals", headers=headers[0])).json()["signals"]) == 1


async def test_outsider_and_cancelled_signaling(client, meeting):
    base, users, headers = meeting
    assert (await client.get(f"{base}/signals", headers=headers[3])).status_code == 404
    assert (await client.post(f"{base}/signals", headers=headers[3], json={"kind": "JOIN"})).status_code == 404
    assert (await client.post(f"{base}/signals", headers=headers[0], json={
        "kind": "OFFER", "to_user_id": str(users[3].id),
    })).status_code == 422
    assert (await client.post(f"{base}/cancel", headers=headers[0])).status_code == 200
    for member_headers in headers[:3]:
        assert (await client.get(f"{base}/signals", headers=member_headers)).status_code == 409
        assert (await client.post(f"{base}/signals", headers=member_headers, json={"kind": "JOIN"})).status_code == 409


async def test_pending_and_accepted_invitees_keep_existing_call_behavior(client, meeting):
    base, users, headers = meeting
    assert (await client.post(f"{base}/respond", headers=headers[2], json={"response": "ACCEPTED"})).status_code == 200
    for member_headers in headers[:3]:
        assert (await client.get(f"{base}/join", headers=member_headers)).status_code == 200
    sent = await client.post(f"{base}/signals", headers=headers[1], json={
        "kind": "OFFER", "to_user_id": str(users[2].id), "payload": {"sdp": "test"},
    })
    assert sent.status_code == 201
    polled = (await client.get(f"{base}/signals", headers=headers[2])).json()
    assert [signal["payload"] for signal in polled["signals"]] == [{"sdp": "test"}]
    assert polled["cursor"] == sent.json()["id"]
    assert (await client.get(f"{base}/signals", headers=headers[2], params={"after": polled["cursor"]})).json()["signals"] == []
