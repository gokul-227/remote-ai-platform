"""
Tests for the signed-in user endpoints and token error handling.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


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
async def test_malformed_bearer_token_returns_generic_401(client: AsyncClient):
    """A garbage bearer token must not leak the raw JWT-library decode error
    (e.g. "Not enough segments" / codec messages) to the client."""
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
        auth_service_module.AuthService, "get_or_create_user", _boom
    )

    response = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 401
    body = response.text
    assert sensitive_text not in body
    assert response.json()["detail"] == "Invalid authentication credentials"


@pytest.mark.asyncio
async def test_not_found_messages_are_used_verbatim(client: AsyncClient):
    """NotFoundError used to append " not found" to already complete messages."""
    resp = await client.get(f"/api/v1/jobs/{uuid.uuid4()}")
    assert resp.status_code == 404
    body = resp.json()
    message = body.get("error") or body.get("detail")
    assert "not found not found" not in message
