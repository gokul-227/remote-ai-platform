"""
Tests for Auth domain, registration, login, and authorization.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_register_user_success(client: AsyncClient):
    payload = {
        "email": "engineer1@example.com",
        "password": "SecurePassword123!",
        "full_name": "Test Engineer",
        "role": "engineer",
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == "engineer1@example.com"
    # API role values are uppercase to match the frontend authorization contract.
    assert data["user"]["role"] == "ENGINEER"


@pytest.mark.asyncio
async def test_update_me_changes_full_name(client: AsyncClient):
    reg = await client.post("/api/v1/auth/register", json={
        "email": "rename_me@example.com",
        "password": "SecurePassword123!",
        "full_name": "Old Name",
        "role": "engineer",
    })
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    res = await client.patch("/api/v1/auth/me", json={"full_name": "New Name"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["full_name"] == "New Name"

    me_res = await client.get("/api/v1/auth/me", headers=headers)
    assert me_res.json()["full_name"] == "New Name"


@pytest.mark.asyncio
async def test_update_me_requires_auth(client: AsyncClient):
    res = await client.patch("/api/v1/auth/me", json={"full_name": "New Name"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_register_admin_forbidden(client: AsyncClient):
    payload = {
        "email": "hacker@example.com",
        "password": "SecurePassword123!",
        "full_name": "Fake Admin",
        "role": "admin",
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 403
    assert "Cannot self-assign admin role" in response.json()["detail"]


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    # Register first
    reg_payload = {
        "email": "loginuser@example.com",
        "password": "MyPassword123!",
        "full_name": "Login User",
        "role": "engineer",
    }
    await client.post("/api/v1/auth/register", json=reg_payload)

    # Login
    login_payload = {
        "email": "loginuser@example.com",
        "password": "MyPassword123!",
    }
    response = await client.post("/api/v1/auth/login", json=login_payload)
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == "loginuser@example.com"


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient):
    login_payload = {
        "email": "nonexistent@example.com",
        "password": "WrongPassword",
    }
    response = await client.post("/api/v1/auth/login", json=login_payload)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_resolves_user_with_no_keycloak_id(
    client: AsyncClient, db: AsyncSession
):
    """Regression for a refresh-token bug affecting any user record with no
    keycloak_id (e.g. an account created directly against a raw user id
    rather than through the password/register flow, which always stamps a
    keycloak_id -- the previous OAuth-broker's own /oauth/exchange endpoint
    used to create exactly such accounts before that broker was removed in
    favor of Supabase-hosted OAuth; the "sub" ambiguity it worked around is
    unchanged: a refresh token's "sub" claim is the user's own id whenever
    keycloak_id is None, per create_token's `str(user.keycloak_id or user.id)`).

    /auth/refresh previously resolved "sub" ONLY via get_by_keycloak_id,
    which can never match a raw user id -- such an account's refresh token
    would silently fail to resolve to any user, signing them out early with
    no way to refresh the session.
    """
    from app.domains.auth.models import User, UserRole
    from app.domains.auth.router import create_refresh_token

    user = User(
        id=uuid.uuid4(),
        keycloak_id=None,
        email="no-keycloak-user@example.com",
        full_name="No Keycloak User",
        role=UserRole.ENGINEER,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    refresh_token = create_refresh_token(user)
    response = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == 200
    assert response.json()["user"]["email"] == "no-keycloak-user@example.com"


@pytest.mark.asyncio
async def test_malformed_bearer_token_returns_generic_401(client: AsyncClient):
    """A garbage bearer token must not leak the raw JWT-library decode error
    (e.g. python-jose's "Not enough segments" / codec messages) to the client.

    AuthService.verify_token already wraps python-jose's JWTError into an
    app-authored AuthenticationError("Invalid or expired authentication
    token"), so this specific path was already safe; this test locks that
    behavior in as a regression guard alongside the fix below, which covers
    exceptions that are *not* pre-wrapped into a safe AuthenticationError.
    """
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not-a-real-jwt-at-all"},
    )
    assert response.status_code == 401
    detail = response.json()["detail"]
    # Make sure none of the raw decode-library vocabulary leaked through.
    lowered = detail.lower()
    for leaky_term in ("segment", "codec", "traceback", "jose", "jwt.exceptions"):
        assert leaky_term not in lowered


@pytest.mark.asyncio
async def test_unexpected_error_during_auth_does_not_leak_internals(client: AsyncClient, monkeypatch):
    """If token verification succeeds but a downstream (e.g. DB) error occurs
    while resolving the user, the client must get a generic 401 -- never the
    raw exception text, which could carry SQL fragments or connection info.
    """
    import app.domains.auth.service as auth_service_module

    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "leak_check@example.com",
            "password": "SecurePassword123!",
            "full_name": "Leak Check",
            "role": "engineer",
        },
    )
    assert reg.status_code == 200
    token = reg.json()["access_token"]

    sensitive_text = "psycopg2.OperationalError: password authentication failed for user \"remote_ai_platform\""

    async def _boom(self, payload):
        raise RuntimeError(sensitive_text)

    monkeypatch.setattr(
        auth_service_module.AuthService, "get_or_create_user_from_token", _boom
    )

    response = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401
    body = response.text
    assert sensitive_text not in body
    assert response.json()["detail"] == "Invalid authentication credentials"
