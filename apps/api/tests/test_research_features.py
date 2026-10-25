"""Features from the external-product research round: reactions, invitation lifecycle,
proposal revision, channel notification levels, meeting participant management."""

import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import unquote

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from test_applications import _company_job_and_engineer

from app.domains.applications.models import JobApplication
from app.domains.network.models import Connection
from app.domains.notifications.models import Notification


async def _user(client: AsyncClient, name: str = "R User", role: str = "ENGINEER"):
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": f"rf_{uuid.uuid4().hex[:8]}@test.com", "password": "Password123!", "full_name": name, "role": role},
    )
    b = res.json()
    return uuid.UUID(b["user"]["id"]), {"Authorization": f"Bearer {b['access_token']}"}


# ── Reactions ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_reactions_one_per_person_changeable_and_counted(client: AsyncClient):
    _, ah = await _user(client)
    _, bh = await _user(client)
    post = (await client.post("/api/v1/social/posts", json={"content": "Shipped v2", "visibility": "PUBLIC"}, headers=ah)).json()
    url = f"/api/v1/social/posts/{post['id']}/reaction"

    assert (await client.put(url, json={"reaction": "CELEBRATE"}, headers=bh)).json()["like_count"] == 1
    # Same reaction again is a no-op; a different one replaces it without double counting.
    assert (await client.put(url, json={"reaction": "CELEBRATE"}, headers=bh)).json()["like_count"] == 1
    assert (await client.put(url, json={"reaction": "INSIGHTFUL"}, headers=bh)).json()["like_count"] == 1
    await client.put(url, json={"reaction": "LIKE"}, headers=ah)
    detail = (await client.get(f"/api/v1/social/posts/{post['id']}", headers=bh)).json()
    assert detail["my_reaction"] == "INSIGHTFUL"
    assert detail["reaction_counts"] == {"INSIGHTFUL": 1, "LIKE": 1}
    assert (await client.put(url, json={"reaction": "ANGRY"}, headers=bh)).status_code == 422
    assert (await client.delete(url, headers=bh)).json() == {"my_reaction": None, "like_count": 1}
    assert (await client.delete(url, headers=bh)).json()["like_count"] == 1


@pytest.mark.asyncio
async def test_reactions_respect_post_visibility(client: AsyncClient):
    _, ah = await _user(client)
    _, bh = await _user(client)
    post = (await client.post("/api/v1/social/posts", json={"content": "Private", "visibility": "PRIVATE"}, headers=ah)).json()
    assert (await client.put(f"/api/v1/social/posts/{post['id']}/reaction", json={"reaction": "LIKE"}, headers=bh)).status_code == 404


# ── Invitations and proposals ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_invitation_expires_and_decline_reason(client: AsyncClient, db: AsyncSession):
    co, eng, profile_id, job_id = await _company_job_and_engineer(client, f"exp{uuid.uuid4().hex[:6]}")
    inv = (await client.post(f"/api/v1/applications/jobs/{job_id}/invite/{profile_id}", headers=co)).json()
    assert inv["invite_expires_at"] is not None
    row = await db.get(JobApplication, uuid.UUID(inv["id"]))
    row.invite_expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await db.commit()
    expired = await client.patch(f"/api/v1/applications/{inv['id']}/respond", json={"accept": True}, headers=eng)
    assert expired.status_code == 409

    # Re-inviting reopens it with a fresh expiry; declining records a reason.
    await client.post(f"/api/v1/applications/jobs/{job_id}/invite/{profile_id}", headers=co)
    declined = await client.patch(
        f"/api/v1/applications/{inv['id']}/respond", json={"accept": False, "decline_reason": "NOT_AVAILABLE"}, headers=eng
    )
    assert declined.json()["decline_reason"] == "NOT_AVAILABLE"


@pytest.mark.asyncio
async def test_organisation_can_cancel_unanswered_invitation_only(client: AsyncClient):
    co, eng, profile_id, job_id = await _company_job_and_engineer(client, f"can{uuid.uuid4().hex[:6]}")
    other_co, _, _, _ = await _company_job_and_engineer(client, f"oth{uuid.uuid4().hex[:6]}")
    inv = (await client.post(f"/api/v1/applications/jobs/{job_id}/invite/{profile_id}", headers=co)).json()
    assert (await client.post(f"/api/v1/applications/{inv['id']}/cancel-invitation", headers=other_co)).status_code == 404
    assert (await client.post(f"/api/v1/applications/{inv['id']}/cancel-invitation", headers=co)).json()["status"] == "CANCELLED"
    assert (await client.patch(f"/api/v1/applications/{inv['id']}/respond", json={"accept": True}, headers=eng)).status_code == 409
    assert (await client.post(f"/api/v1/applications/{inv['id']}/cancel-invitation", headers=co)).status_code == 409


@pytest.mark.asyncio
async def test_closed_job_cannot_invite_and_capacity_is_enforced(client: AsyncClient, db: AsyncSession, monkeypatch):
    import app.domains.applications.router as r
    from app.domains.jobs.models import JobPost

    co, _, profile_id, job_id = await _company_job_and_engineer(client, f"cap{uuid.uuid4().hex[:6]}")
    monkeypatch.setattr(r, "MAX_OPEN_INVITATIONS_PER_JOB", 0)
    assert (await client.post(f"/api/v1/applications/jobs/{job_id}/invite/{profile_id}", headers=co)).status_code == 429
    monkeypatch.setattr(r, "MAX_OPEN_INVITATIONS_PER_JOB", 50)
    job = await db.get(JobPost, uuid.UUID(job_id))
    job.is_active = False
    await db.commit()
    assert (await client.post(f"/api/v1/applications/jobs/{job_id}/invite/{profile_id}", headers=co)).status_code == 409


@pytest.mark.asyncio
async def test_proposal_revision_only_before_review(client: AsyncClient):
    co, eng, _, job_id = await _company_job_and_engineer(client, f"rev{uuid.uuid4().hex[:6]}")
    _, stranger = await _user(client)
    app_ = (await client.post(f"/api/v1/applications/jobs/{job_id}", json={"cover_note": "v1"}, headers=eng)).json()
    assert (await client.patch(f"/api/v1/applications/{app_['id']}/proposal", json={"cover_note": "x"}, headers=stranger)).status_code == 404
    revised = await client.patch(f"/api/v1/applications/{app_['id']}/proposal", json={"cover_note": "v2"}, headers=eng)
    assert revised.json()["cover_note"] == "v2"
    assert revised.json()["revised_at"] is not None
    await client.patch(f"/api/v1/applications/{app_['id']}/status", json={"status": "REVIEWING"}, headers=co)
    assert (await client.patch(f"/api/v1/applications/{app_['id']}/proposal", json={"cover_note": "v3"}, headers=eng)).status_code == 409


# ── Channel notification levels ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_channel_notification_levels(client: AsyncClient, db: AsyncSession):
    a, ah = await _user(client)
    b, bh = await _user(client)
    c, chh = await _user(client)
    db.add_all([Connection(sender_id=a, receiver_id=b, status="ACCEPTED"), Connection(sender_id=a, receiver_id=c, status="ACCEPTED")])
    await db.commit()
    cid = (await client.post("/api/v1/channels", json={"kind": "GROUP", "name": "n", "member_ids": [str(b), str(c)]}, headers=ah)).json()["id"]
    assert (await client.post(f"/api/v1/channels/{cid}/notifications", json={"level": "ALL"}, headers=chh)).json()["notify_level"] == "ALL"
    await client.post(f"/api/v1/channels/{cid}/mute", json={"muted": True}, headers=bh)

    await client.post(f"/api/v1/channels/{cid}/messages", json={"body": "hi @b", "mentions": [str(b)]}, headers=ah)

    async def count(uid):
        return len((await db.execute(select(Notification).where(Notification.user_id == uid))).scalars().all())

    assert await count(b) == 0  # muted suppresses mentions too
    assert await count(c) == 1  # ALL hears top-level messages


# ── Meeting participants ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_meeting_participants_and_reschedule(client: AsyncClient, db: AsyncSession):
    a, ah = await _user(client, "Ada Organiser")
    b, bh = await _user(client, "Bo Guest")
    c, ch_ = await _user(client)
    db.add_all([Connection(sender_id=a, receiver_id=b, status="ACCEPTED"), Connection(sender_id=a, receiver_id=c, status="ACCEPTED")])
    await db.commit()
    start = datetime.now(UTC) + timedelta(minutes=5)
    m = (await client.post("/api/v1/meetings", json={
        "title": "Sync", "starts_at": start.isoformat(), "ends_at": (start + timedelta(minutes=30)).isoformat(),
        "participant_ids": [str(b)],
    }, headers=ah)).json()

    join = (await client.get(f"/api/v1/meetings/{m['id']}/join", headers=bh)).json()["url"]
    assert unquote(join).endswith('#userInfo.displayName="Bo Guest"')

    assert (await client.post(f"/api/v1/meetings/{m['id']}/participants", json={"user_id": str(c)}, headers=bh)).status_code == 403
    added = await client.post(f"/api/v1/meetings/{m['id']}/participants", json={"user_id": str(c)}, headers=ah)
    assert len(added.json()["participants"]) == 2
    await client.post(f"/api/v1/meetings/{m['id']}/respond", json={"response": "ACCEPTED"}, headers=bh)
    removed = await client.delete(f"/api/v1/meetings/{m['id']}/participants/{c}", headers=ah)
    assert [p["user_id"] for p in removed.json()["participants"]] == [str(b)]
    assert (await client.get(f"/api/v1/meetings/{m['id']}", headers=ch_)).status_code == 404

    later = datetime.now(UTC) + timedelta(days=2)
    moved = await client.patch(f"/api/v1/meetings/{m['id']}", json={
        "starts_at": later.isoformat(), "ends_at": (later + timedelta(hours=1)).isoformat()}, headers=ah)
    assert moved.json()["phase"] == "UPCOMING"
    assert moved.json()["participants"][0]["response"] == "INVITED"


# ── Jira-style watching (from the Atlassian help capture) ─────────────────────


@pytest.mark.asyncio
async def test_commenting_watches_and_watchers_hear_about_comments(client: AsyncClient, db: AsyncSession):
    from app.domains.projects.models import ProjectMember, TaskWatcher

    owner_id, owner = await _user(client, "Owner", "COMPANY")
    await client.post("/api/v1/companies/me", headers=owner, json={"name": f"W {uuid.uuid4().hex[:5]}"})
    pid = (await client.post("/api/v1/projects", headers=owner, json={"title": "P", "description": "D"})).json()["id"]
    member_id, member = await _user(client, "Member")
    db.add(ProjectMember(project_id=uuid.UUID(pid), user_id=member_id))
    await db.commit()
    task = (await client.post("/api/v1/projects/tasks", headers=owner, json={"project_id": pid, "title": "T"})).json()

    assert (await client.post(f"/api/v1/projects/tasks/{task['id']}/comments", headers=member, json={"content": "on it"})).status_code == 201
    watchers = (await db.execute(select(TaskWatcher.user_id).where(TaskWatcher.task_id == uuid.UUID(task["id"])))).scalars().all()
    assert set(watchers) == {owner_id, member_id}
    notes = (await db.execute(select(Notification).where(Notification.user_id == owner_id, Notification.title == "New comment"))).scalars().all()
    assert len(notes) == 1
