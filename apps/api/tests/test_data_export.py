"""DATA-02: the data export is complete for the user and minimal for everyone else."""

import uuid

import pytest
from auth_support import token_for
from httpx import AsyncClient
from sqlalchemy import insert

from app.core.database import Base
from app.domains.auth.export import EXCLUDED, exported_columns


def test_every_user_or_profile_link_is_classified():
    """A new table that references users or profiles must be added to the
    export or excluded with a reason — never silently included or missed."""
    import importlib
    import pkgutil

    import app.domains

    # Load every domain's models, not just those some other import happened to pull in.
    for mod in pkgutil.iter_modules(app.domains.__path__):
        try:
            importlib.import_module(f"app.domains.{mod.name}.models")
        except ModuleNotFoundError:
            pass
    linked = {
        (t.name, c.name)
        for t in Base.metadata.sorted_tables
        for c in t.columns
        if any(fk.column.table.name in {"users", "engineer_profiles", "company_profiles"} for fk in c.foreign_keys)
    }
    unclassified = sorted(linked - exported_columns() - set(EXCLUDED))
    assert unclassified == []


async def _user(client: AsyncClient, role: str = "ENGINEER"):
    from conftest import TestingSessionLocal
    from sqlalchemy import select

    from app.domains.auth.models import User

    email = f"x-{uuid.uuid4().hex[:8]}@example.com"
    reg = await client.post(
        "/api/v1/auth/register", json={"email": email, "password": "p", "full_name": "X", "role": role}
    )
    assert reg.status_code == 200
    async with TestingSessionLocal() as db:
        user = await db.scalar(select(User).where(User.email == email))
        if role == "ADMIN":
            from app.domains.auth.models import UserRole

            user.role = UserRole.ADMIN
            await db.commit()
        return user


async def _export(client: AsyncClient, user) -> dict:
    resp = await client.get("/api/v1/auth/me/export", headers={"Authorization": f"Bearer {token_for(user)}"})
    assert resp.status_code == 200
    return resp.json()


@pytest.mark.asyncio
async def test_reports_stay_private_to_the_reporter(client: AsyncClient):
    from conftest import TestingSessionLocal

    reporter, subject, admin = await _user(client), await _user(client), await _user(client, "ADMIN")
    reports = Base.metadata.tables["moderation_reports"]
    async with TestingSessionLocal() as db:
        await db.execute(
            insert(reports).values(
                id=uuid.uuid4(), reporter_id=reporter.id, target_type="USER", target_id=str(subject.id),
                reason="spam", status="RESOLVED", decision="WARNED", decision_note="internal note",
                reviewed_by_id=admin.id,
            )
        )
        await db.commit()

    mine = (await _export(client, reporter))["moderation_reports"]
    assert len(mine) == 1 and mine[0]["reason"] == "spam" and mine[0]["decision"] == "WARNED"
    assert "reviewed_by_id" not in mine[0] and "decision_note" not in mine[0]
    # Neither the reported person nor the moderator gets the reporter's report.
    assert "moderation_reports" not in await _export(client, subject)
    assert "moderation_reports" not in await _export(client, admin)


@pytest.mark.asyncio
async def test_messages_in_both_directions_are_included(client: AsyncClient):
    from conftest import TestingSessionLocal

    me, other, stranger = await _user(client), await _user(client), await _user(client)
    conv, msgs = Base.metadata.tables["conversations"], Base.metadata.tables["messages"]
    conv_id = uuid.uuid4()
    async with TestingSessionLocal() as db:
        await db.execute(insert(conv).values(id=conv_id, participant_one_id=me.id, participant_two_id=other.id))
        await db.execute(insert(msgs).values(id=uuid.uuid4(), conversation_id=conv_id, sender_id=me.id, content="hi"))
        await db.execute(insert(msgs).values(id=uuid.uuid4(), conversation_id=conv_id, sender_id=other.id, content="hello"))
        await db.commit()

    assert sorted(m["content"] for m in (await _export(client, me))["messages"]) == ["hello", "hi"]
    assert "messages" not in await _export(client, stranger)


@pytest.mark.asyncio
async def test_profile_export_has_data_but_no_capability_urls(client: AsyncClient):
    user = await _user(client)
    headers = {"Authorization": f"Bearer {token_for(user)}"}
    assert (await client.post("/api/v1/engineers/me", headers=headers, json={"headline": "Writer", "skills": ["Copy"]})).status_code == 201

    data = await _export(client, user)
    profile = data["engineer_profiles"][0]
    assert profile["headline"] == "Writer"
    assert "resume_url" not in profile
    assert "auth_subject" not in data["account"]
