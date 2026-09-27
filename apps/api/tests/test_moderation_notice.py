"""Phase 07: moderation decisions are explained to the affected person with a
way to appeal, and never reveal who reported them or the moderator's notes."""

import uuid

import pytest
from auth_support import token_for
from httpx import AsyncClient
from sqlalchemy import select


async def _user(client: AsyncClient, role: str = "ENGINEER"):
    from conftest import TestingSessionLocal

    from app.domains.auth.models import User, UserRole

    email = f"m-{uuid.uuid4().hex[:8]}@example.com"
    await client.post("/api/v1/auth/register", json={"email": email, "password": "p", "full_name": "Reporter Person", "role": "ENGINEER"})
    async with TestingSessionLocal() as db:
        user = await db.scalar(select(User).where(User.email == email))
        if role == "ADMIN":
            user.role = UserRole.ADMIN
            await db.commit()
        return user


def _h(u) -> dict:
    return {"Authorization": f"Bearer {token_for(u)}"}


@pytest.mark.asyncio
async def test_removed_post_owner_is_told_why_and_how_to_appeal(client: AsyncClient):
    author, reporter, admin = await _user(client), await _user(client), await _user(client, "ADMIN")
    post = (await client.post("/api/v1/social/posts", headers=_h(author), json={"content": "buy followers"})).json()
    report = (await client.post("/api/v1/moderation/reports", headers=_h(reporter),
                                json={"target_type": "POST", "target_id": post["id"], "reason": "Spam or misleading content"})).json()
    decided = await client.patch(f"/api/v1/moderation/reports/{report['id']}", headers=_h(admin),
                                 json={"status": "RESOLVED", "decision": "REMOVE_POST", "note": "internal: repeat offender"})
    assert decided.status_code == 200

    notes = (await client.get("/api/v1/notifications", headers=_h(author))).json()
    notice = next(n for n in (notes if isinstance(notes, list) else notes["items"]) if n["kind"] == "moderation")
    text = f"{notice['title']} {notice['body']}"
    assert "removed" in text.lower() and "appeal" in text.lower() and "contact@" in text
    assert "Reporter Person" not in text and "repeat offender" not in text


@pytest.mark.asyncio
async def test_suspended_member_is_told_how_to_appeal(client: AsyncClient):
    member, reporter, admin = await _user(client), await _user(client), await _user(client, "ADMIN")
    report = (await client.post("/api/v1/moderation/reports", headers=_h(reporter),
                                json={"target_type": "USER", "target_id": str(member.id), "reason": "Harassment"})).json()
    await client.patch(f"/api/v1/moderation/reports/{report['id']}", headers=_h(admin),
                       json={"status": "RESOLVED", "decision": "SUSPEND_USER"})
    resp = await client.get("/api/v1/auth/me", headers=_h(member))
    assert resp.status_code == 403
    assert "suspended" in resp.json()["detail"].lower() and "appeal" in resp.json()["detail"].lower()
