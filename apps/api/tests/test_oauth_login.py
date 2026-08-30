import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch

from app.core.config import settings


@pytest.mark.asyncio
async def test_login_url_404_when_unconfigured(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", None)
    resp = await client.get("/api/v1/auth/oauth/google/login-url")
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_login_url_returns_real_google_auth_url(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "test-client-id")
    resp = await client.get("/api/v1/auth/oauth/google/login-url")
    assert resp.status_code == 200
    url = resp.json()["url"]
    assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert "client_id=test-client-id" in url
    assert "state=" in url


@pytest.mark.asyncio
async def test_unknown_provider_404s(client: AsyncClient):
    resp = await client.get("/api/v1/auth/oauth/facebook/login-url")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_callback_rejects_invalid_state(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "test-client-id")
    resp = await client.get(
        "/api/v1/auth/oauth/google/callback",
        params={"code": "somecode", "state": "not-a-real-state"},
        follow_redirects=False,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_callback_denied_redirects_to_login_with_error(client: AsyncClient):
    resp = await client.get(
        "/api/v1/auth/oauth/google/callback",
        params={"error": "access_denied"},
        follow_redirects=False,
    )
    assert resp.status_code in (302, 307)
    assert "error=oauth_denied" in resp.headers["location"]


@pytest.mark.asyncio
async def test_full_new_user_oauth_flow_creates_account_and_exchange_works(
    client: AsyncClient, monkeypatch
):
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "test-secret")

    login_resp = await client.get("/api/v1/auth/oauth/google/login-url")
    from urllib.parse import urlparse, parse_qs

    state = parse_qs(urlparse(login_resp.json()["url"]).query)["state"][0]

    from app.domains.auth.oauth import OAuthUserInfo

    with patch(
        "app.domains.auth.oauth.exchange_code_for_userinfo",
        new=AsyncMock(
            return_value=OAuthUserInfo(
                email="new-oauth-user@example.com", full_name="New OAuth User", avatar_url=None
            )
        ),
    ):
        callback_resp = await client.get(
            "/api/v1/auth/oauth/google/callback",
            params={"code": "real-code", "state": state},
            follow_redirects=False,
        )
    assert callback_resp.status_code in (302, 307)
    location = callback_resp.headers["location"]
    assert "/auth/oauth-callback?handoff=" in location
    handoff = location.split("handoff=")[1]

    # Re-using the same state should now fail (single-use).
    with patch(
        "app.domains.auth.oauth.exchange_code_for_userinfo",
        new=AsyncMock(
            return_value=OAuthUserInfo(email="x@example.com", full_name="X", avatar_url=None)
        ),
    ):
        replay_resp = await client.get(
            "/api/v1/auth/oauth/google/callback",
            params={"code": "real-code", "state": state},
            follow_redirects=False,
        )
    assert replay_resp.status_code == 400

    exchange_resp = await client.post("/api/v1/auth/oauth/exchange", json={"handoff": handoff})
    assert exchange_resp.status_code == 200
    body = exchange_resp.json()
    assert body["user"]["email"] == "new-oauth-user@example.com"
    assert body["user"]["role"] == "ENGINEER"
    assert "access_token" in body and "refresh_token" in body

    # Handoff code is single-use too.
    replay_exchange = await client.post("/api/v1/auth/oauth/exchange", json={"handoff": handoff})
    assert replay_exchange.status_code == 400

    # A logged-in check with the issued token should work.
    me_resp = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "new-oauth-user@example.com"


@pytest.mark.asyncio
async def test_existing_user_oauth_login_does_not_duplicate_account(
    client: AsyncClient, monkeypatch
):
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "test-secret")

    register_resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "existing-oauth-user@example.com",
            "password": "secure-pass-123",
            "full_name": "Existing User",
            "role": "COMPANY",
        },
    )
    existing_id = register_resp.json()["user"]["id"]

    login_resp = await client.get("/api/v1/auth/oauth/google/login-url")
    from urllib.parse import urlparse, parse_qs

    state = parse_qs(urlparse(login_resp.json()["url"]).query)["state"][0]

    from app.domains.auth.oauth import OAuthUserInfo

    with patch(
        "app.domains.auth.oauth.exchange_code_for_userinfo",
        new=AsyncMock(
            return_value=OAuthUserInfo(
                email="existing-oauth-user@example.com", full_name="Existing User", avatar_url=None
            )
        ),
    ):
        callback_resp = await client.get(
            "/api/v1/auth/oauth/google/callback",
            params={"code": "real-code", "state": state},
            follow_redirects=False,
        )
    handoff = callback_resp.headers["location"].split("handoff=")[1]
    exchange_resp = await client.post("/api/v1/auth/oauth/exchange", json={"handoff": handoff})
    assert exchange_resp.json()["user"]["id"] == existing_id
    assert exchange_resp.json()["user"]["role"] == "COMPANY"  # preserved, not reset to ENGINEER
