"""Self-service data export and account deletion (GDPR access, portability, erasure)."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def _register(client: AsyncClient, role: str = "ENGINEER") -> tuple[dict[str, str], str]:
    resp = await client.post("/api/v1/auth/register", json={
        "email": f"self-{uuid.uuid4().hex[:8]}@privacy-example.com", "full_name": "Self Service", "role": role})
    body = resp.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]["id"]


@pytest.mark.asyncio
async def test_export_contains_my_data_and_not_secrets(client: AsyncClient):
    headers, user_id = await _register(client)
    await client.post("/api/v1/engineers/me", headers=headers, json={"headline": "Translator", "skills": ["German"]})
    other, _ = await _register(client)
    await client.post("/api/v1/engineers/me", headers=other, json={"headline": "Someone else", "skills": []})

    resp = await client.get("/api/v1/auth/me/export", headers=headers)
    assert resp.status_code == 200
    assert "attachment" in resp.headers["content-disposition"]
    data = resp.json()
    assert data["account"]["id"] == user_id
    assert [p["headline"] for p in data["engineer_profiles"]] == ["Translator"]
    text = resp.text
    assert "Someone else" not in text
    assert "auth_subject" not in text and "resume_url" not in text


@pytest.mark.asyncio
async def test_delete_my_account_removes_user_and_data(client: AsyncClient, db: AsyncSession):
    from app.domains.auth.models import User
    from app.domains.engineers.models import EngineerProfile

    headers, user_id = await _register(client)
    await client.post("/api/v1/engineers/me", headers=headers, json={"headline": "Leaving", "skills": []})

    refused = await client.request("DELETE", "/api/v1/auth/me", headers=headers, json={"confirm": "yes"})
    assert refused.status_code == 422

    deleted = await client.request("DELETE", "/api/v1/auth/me", headers=headers, json={"confirm": "DELETE"})
    assert deleted.status_code == 204
    assert await db.get(User, uuid.UUID(user_id)) is None
    assert (await db.execute(select(EngineerProfile).where(EngineerProfile.user_id == uuid.UUID(user_id)))).first() is None


@pytest.mark.asyncio
async def test_admins_cannot_delete_themselves(client: AsyncClient, test_user, auth_headers, db: AsyncSession):
    from app.domains.auth.models import UserRole

    test_user.role = UserRole.ADMIN
    await db.commit()
    resp = await client.request("DELETE", "/api/v1/auth/me", headers=auth_headers, json={"confirm": "DELETE"})
    assert resp.status_code == 403
