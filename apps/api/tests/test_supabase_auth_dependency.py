"""Tests for the Supabase Auth path through get_current_user.
Uses a real generated EC keypair
in place of a real Supabase project's JWKS -- no network dependency.
"""

import asyncio
import time
import uuid
from types import SimpleNamespace
from unittest.mock import patch

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from httpx import AsyncClient

from app.core.config import settings
from app.domains.auth import supabase_auth

_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
_PUBLIC_KEY = _PRIVATE_KEY.public_key()


def _make_token(sub: str, email: str) -> str:
    now = int(time.time())
    claims = {
        "sub": sub,
        "email": email,
        "aud": "authenticated",
        "role": "authenticated",
        "iss": "https://test-project.supabase.co/auth/v1",
        "iat": now,
        "exp": now + 3600,
    }
    return jwt.encode(claims, _PRIVATE_KEY, algorithm="ES256")


@pytest.fixture(autouse=True)
def _supabase_auth_mode(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://test-project.supabase.co")
    fake_client = SimpleNamespace(
        get_signing_key_from_jwt=lambda token: SimpleNamespace(key=_PUBLIC_KEY)
    )
    with patch.object(supabase_auth, "_jwks_client", fake_client):
        yield


@pytest.mark.asyncio
async def test_new_supabase_identity_auto_provisions_local_user(client: AsyncClient):
    sub = str(uuid.uuid4())
    token = _make_token(sub, "new-supabase-user@example.com")

    resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "new-supabase-user@example.com"
    assert body["role"] == "ENGINEER"  # default, not decided by the IdP


@pytest.mark.asyncio
async def test_same_supabase_identity_resolves_to_same_local_user_on_repeat_requests(
    client: AsyncClient,
):
    sub = str(uuid.uuid4())
    token = _make_token(sub, "repeat-supabase-user@example.com")

    first = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    second = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert first.json()["id"] == second.json()["id"]


@pytest.mark.asyncio
async def test_invalid_supabase_token_rejected(client: AsyncClient):
    resp = await client.get(
        "/api/v1/auth/me", headers={"Authorization": "Bearer not-a-real-token"}
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_logout_all_revokes_already_issued_supabase_tokens(client: AsyncClient):
    """Supabase tokens carry no version claim, so /auth/logout-all used to
    leave every already-issued access token valid until it expired."""
    sub = str(uuid.uuid4())
    email = "logout-all-supabase@example.com"
    now = int(time.time())

    def token_issued_at(iat: int) -> str:
        claims = {
            "sub": sub,
            "email": email,
            "aud": "authenticated",
            "role": "authenticated",
            "iss": "https://test-project.supabase.co/auth/v1",
            "iat": iat,
            "exp": iat + 3600,
        }
        return jwt.encode(claims, _PRIVATE_KEY, algorithm="ES256")

    old = {"Authorization": f"Bearer {token_issued_at(now - 60)}"}
    other_device = {"Authorization": f"Bearer {token_issued_at(now - 30)}"}
    assert (await client.get("/api/v1/auth/me", headers=old)).status_code == 200

    assert (await client.post("/api/v1/auth/logout-all", headers=old)).status_code == 200

    assert (await client.get("/api/v1/auth/me", headers=old)).status_code == 401
    assert (await client.get("/api/v1/auth/me", headers=other_device)).status_code == 401
    # Signing in again afterwards works (iat has whole-second precision).
    await asyncio.sleep(1.1)
    fresh = {"Authorization": f"Bearer {token_issued_at(int(time.time()))}"}
    assert (await client.get("/api/v1/auth/me", headers=fresh)).status_code == 200
