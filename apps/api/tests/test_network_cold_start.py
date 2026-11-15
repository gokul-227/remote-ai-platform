"""People you may know (on-platform signals, privacy-respecting) and personal invite links."""

import uuid

import pytest
from auth_support import token_for
from conftest import TestingSessionLocal
from httpx import AsyncClient
from sqlalchemy import select

from app.domains.applications.models import JobApplication
from app.domains.auth.models import User, UserRole
from app.domains.companies.models import CompanyProfile, OrganisationMember
from app.domains.engineers.models import EngineerProfile
from app.domains.groups.models import Group, GroupMembership
from app.domains.network.models import Connection, MemberInvite, UserBlock


async def _user(
    db, name: str, skills: list[str] | None = None, public: bool = True, role=UserRole.ENGINEER, active=True
) -> User:
    u = User(
        id=uuid.uuid4(), auth_subject=str(uuid.uuid4()), email=f"{uuid.uuid4().hex[:8]}@x.org",
        full_name=name, role=role, is_active=active,
    )
    db.add(u)
    await db.flush()
    db.add(EngineerProfile(user_id=u.id, skills=skills or [], is_public=public, headline=f"{name} headline"))
    await db.flush()
    return u


def _h(u: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {token_for(u)}"}


@pytest.mark.asyncio
async def test_suggestions_use_signals_and_respect_privacy(client: AsyncClient):
    async with TestingSessionLocal() as db:
        me = await _user(db, "Me", ["Python", "FastAPI", "React"])
        skills = await _user(db, "Skills Match", ["python", "fastapi"])
        one_skill = await _user(db, "One Skill", ["python"])
        hidden = await _user(db, "Hidden", ["python", "fastapi"], public=False)
        blocked = await _user(db, "Blocked", ["python", "fastapi"])
        connected = await _user(db, "Connected", ["python", "fastapi"])
        staff = await _user(db, "Staff", ["python", "fastapi"], role=UserRole.ADMIN)
        gone = await _user(db, "Gone", ["python", "fastapi"], active=False)
        colleague = await _user(db, "Colleague")
        grouped = await _user(db, "Group Mate")
        private_mate = await _user(db, "Private Mate")
        db.add(UserBlock(blocker_id=blocked.id, blocked_id=me.id))
        db.add(Connection(sender_id=me.id, receiver_id=connected.id, status="REJECTED"))
        company = CompanyProfile(user_id=me.id, name="Acme")
        db.add(company)
        await db.flush()
        db.add(OrganisationMember(company_id=company.id, user_id=colleague.id, status="active"))
        public_group = Group(name="Remote Python", slug="remote-python", is_private=False)
        secret_group = Group(name="Secret", slug="secret", is_private=True)
        db.add_all([public_group, secret_group])
        await db.flush()
        for g, u in [(public_group, me), (public_group, grouped), (secret_group, me), (secret_group, private_mate)]:
            db.add(GroupMembership(group_id=g.id, user_id=u.id, status="active"))
        await db.commit()
        ids = {u.full_name: str(u.id) for u in [skills, one_skill, hidden, blocked, connected, staff, gone, colleague, grouped, private_mate]}

    resp = await client.get("/api/v1/connections/suggestions", headers=_h(me))
    assert resp.status_code == 200, resp.text
    out = resp.json()
    got = {p["full_name"]: p for p in out}
    assert set(got) == {"Skills Match", "Colleague", "Group Mate"}
    assert got["Colleague"]["reasons"] == ["Same organisation"]
    assert got["Group Mate"]["reasons"] == ["Also in Remote Python"]
    assert got["Skills Match"]["reasons"][0].startswith("Shared skills: fastapi, python")
    assert out[0]["full_name"] == "Colleague"
    assert all("email" not in p for p in out)
    for name in ("Hidden", "Blocked", "Connected", "Staff", "Gone", "Private Mate", "One Skill"):
        assert ids[name] not in {p["id"] for p in out}


@pytest.mark.asyncio
async def test_shared_applications_never_appear_as_a_reason(client: AsyncClient):
    from app.domains.jobs.models import JobPost

    async with TestingSessionLocal() as db:
        me = await _user(db, "Me", ["go", "rust"])
        await _user(db, "A", ["go", "rust"])
        b = await _user(db, "B", ["go", "rust"])
        job = JobPost(title="Backend", slug="backend", description="x", company_name="Acme")
        db.add(job)
        await db.flush()
        db.add_all([JobApplication(user_id=me.id, job_id=job.id), JobApplication(user_id=b.id, job_id=job.id)])
        await db.commit()
    out = (await client.get("/api/v1/connections/suggestions", headers=_h(me))).json()
    assert [p["full_name"] for p in out] == ["B", "A"]  # same-role signal only reorders
    assert all(not any("appl" in r.lower() for r in p["reasons"]) for p in out)


@pytest.mark.asyncio
async def test_no_signals_returns_empty(client: AsyncClient):
    async with TestingSessionLocal() as db:
        me = await _user(db, "Lonely")
        await db.commit()
    assert (await client.get("/api/v1/connections/suggestions", headers=_h(me))).json() == []


@pytest.mark.asyncio
async def test_invite_link_flow(client: AsyncClient):
    async with TestingSessionLocal() as db:
        inviter = await _user(db, "Inviter")
        joiner = await _user(db, "Joiner")
        await db.commit()
    created = await client.post("/api/v1/invites", headers=_h(inviter))
    assert created.status_code == 201
    token = created.json()["token"]
    async with TestingSessionLocal() as db:
        row = (await db.execute(select(MemberInvite))).scalar_one()
        assert row.token_hash != token  # only the hash is stored

    resolved = await client.get(f"/api/v1/invites/resolve/{token}")
    assert resolved.json() == {"inviter": {"full_name": "Inviter", "headline": "Inviter headline"}}
    assert (await client.post(f"/api/v1/invites/accept/{token}", headers=_h(inviter))).status_code == 400

    accepted = await client.post(f"/api/v1/invites/accept/{token}", headers=_h(joiner))
    assert accepted.json() == {"status": "PENDING", "created": True}
    again = await client.post(f"/api/v1/invites/accept/{token}", headers=_h(joiner))
    assert again.json()["created"] is False
    async with TestingSessionLocal() as db:
        conn = (await db.execute(select(Connection))).scalar_one()
        assert (conn.sender_id, conn.receiver_id, conn.status) == (joiner.id, inviter.id, "PENDING")

    listed = (await client.get("/api/v1/invites", headers=_h(inviter))).json()
    assert listed[0]["uses"] == 1
    invite_id = listed[0]["id"]
    assert (await client.delete(f"/api/v1/invites/{invite_id}", headers=_h(joiner))).status_code == 404
    assert (await client.delete(f"/api/v1/invites/{invite_id}", headers=_h(inviter))).status_code == 204
    assert (await client.get(f"/api/v1/invites/resolve/{token}")).status_code == 404
    assert (await client.post(f"/api/v1/invites/accept/{token}", headers=_h(joiner))).status_code == 404


@pytest.mark.asyncio
async def test_invites_are_rate_limited_and_blocks_apply(client: AsyncClient):
    async with TestingSessionLocal() as db:
        inviter = await _user(db, "Busy")
        blocker = await _user(db, "Blocker")
        db.add(UserBlock(blocker_id=blocker.id, blocked_id=inviter.id))
        await db.commit()
    tokens = []
    for _ in range(5):
        r = await client.post("/api/v1/invites", headers=_h(inviter))
        assert r.status_code == 201
        tokens.append(r.json()["token"])
    assert (await client.post("/api/v1/invites", headers=_h(inviter))).status_code == 429
    assert (await client.post(f"/api/v1/invites/accept/{tokens[0]}", headers=_h(blocker))).status_code == 403
    assert (await client.get("/api/v1/invites/resolve/not-a-token")).status_code == 404
