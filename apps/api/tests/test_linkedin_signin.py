"""LinkedIn sign-in (OpenID Connect through WorkOS) and first-sign-in prefill."""

import pytest
from conftest import TestingSessionLocal
from httpx import AsyncClient
from sqlalchemy import select
from test_workos_auth import bearer, workos, wos_token  # noqa: F401 - fixture

from app.core.config import settings
from app.domains.auth.models import User


@pytest.mark.asyncio
async def test_linkedin_authorize_uses_workos_provider(client: AsyncClient, workos, monkeypatch):  # noqa: F811
    monkeypatch.setattr(settings, "CORS_ORIGINS_RAW", "https://remoteaiplatform.com")
    res = await client.post(
        "/api/v1/auth/workos/authorize",
        json={
            "provider": "linkedin",
            "redirect_uri": "https://remoteaiplatform.com/auth/callback",
            "state": "s" * 20,
            "code_challenge": "c" * 43,
        },
    )
    assert res.status_code == 200
    assert "provider=LinkedInOAuth" in res.json()["url"]


@pytest.mark.asyncio
async def test_first_sign_in_prefills_name_and_photo(client: AsyncClient, workos):  # noqa: F811
    workos.add("user_01LI", "li@example.com")
    workos.users["user_01LI"].update(
        first_name="Ada", last_name="Lovelace", profile_picture_url="https://media.licdn.com/ada.jpg"
    )
    assert (await client.get("/api/v1/auth/me", headers=bearer(wos_token("user_01LI")))).status_code == 200
    async with TestingSessionLocal() as db:
        created = await db.scalar(select(User).where(User.email == "li@example.com"))
        assert created is not None
        assert created.full_name == "Ada Lovelace"
        assert created.avatar_url == "https://media.licdn.com/ada.jpg"


@pytest.mark.asyncio
async def test_prefill_ignores_unsafe_photo_and_missing_name(client: AsyncClient, workos):  # noqa: F811
    workos.add("user_01NP", "np@example.com")
    workos.users["user_01NP"]["profile_picture_url"] = "javascript:alert(1)"
    assert (await client.get("/api/v1/auth/me", headers=bearer(wos_token("user_01NP")))).status_code == 200
    async with TestingSessionLocal() as db:
        created = await db.scalar(select(User).where(User.email == "np@example.com"))
        assert created is not None
        assert created.full_name == "Member"
        assert created.avatar_url is None
