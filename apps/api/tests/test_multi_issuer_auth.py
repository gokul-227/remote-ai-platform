"""Dual validation: tokens from an allow-listed extra issuer (e.g. WorkOS AuthKit)
are verified against that issuer's own keys and mapped to accounts without ever
touching `users.auth_subject`. Removing the issuer from the allow-list is the
rollback and makes its tokens invalid again."""

import json
import time
import uuid
from types import SimpleNamespace

import jwt
import pytest
from auth_support import mint_token
from conftest import TestingSessionLocal
from cryptography.hazmat.primitives.asymmetric import ec
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.domains.auth import supabase_auth
from app.domains.auth.models import User, UserIdentity, UserRole

ISSUER = "https://api.workos.test/user_management/client_123"
AUDIENCE = "client_123"
_KEY = ec.generate_private_key(ec.SECP256R1())


def _extra_token(
    sub: str, email: str | None, *, verified: bool = True, aud: str = AUDIENCE, iss: str = ISSUER
) -> str:
    now = int(time.time())
    claims = {"sub": sub, "aud": aud, "iss": iss, "iat": now, "exp": now + 600}
    if email is not None:
        claims["email"] = email
        claims["email_verified"] = verified
    return jwt.encode(claims, _KEY, algorithm="ES256")


@pytest.fixture
def extra_issuer(monkeypatch):
    monkeypatch.setattr(
        settings,
        "AUTH_EXTRA_ISSUERS",
        json.dumps(
            [
                {
                    "provider": "workos",
                    "issuer": ISSUER,
                    "jwks_url": "https://api.workos.test/jwks",
                    "audience": AUDIENCE,
                }
            ]
        ),
    )
    fake = SimpleNamespace(
        get_signing_key_from_jwt=lambda token: SimpleNamespace(key=_KEY.public_key())
    )
    monkeypatch.setitem(supabase_auth._extra_jwks_clients, ISSUER, fake)
    yield
    supabase_auth._extra_jwks_clients.pop(ISSUER, None)


async def _existing_user(email: str) -> User:
    async with TestingSessionLocal() as db:
        user = User(
            email=email,
            full_name="Existing",
            role=UserRole.ENGINEER,
            auth_subject=f"sb-{uuid.uuid4()}",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


@pytest.mark.asyncio
async def test_extra_issuer_tokens_are_rejected_unless_allow_listed(client: AsyncClient):
    token = _extra_token("wos-1", "nobody@example.com")
    res = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_verified_email_links_to_the_existing_account_without_touching_auth_subject(
    client: AsyncClient, extra_issuer
):
    user = await _existing_user("linked@example.com")
    token = _extra_token("wos-42", "linked@example.com")
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["id"] == str(user.id)
    # Second sign-in reuses the link (no duplicate rows); Supabase subject intact.
    me2 = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me2.json()["id"] == str(user.id)
    async with TestingSessionLocal() as db:
        rows = (
            (await db.execute(select(UserIdentity).where(UserIdentity.user_id == user.id)))
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].provider == "workos"
        assert rows[0].subject == "wos-42"
        refreshed = await db.get(User, user.id)
        assert refreshed is not None
        assert refreshed.auth_subject == user.auth_subject
    # The Supabase token for the same account still works (dual validation).
    sb = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {mint_token(user.auth_subject, user.email)}"},
    )
    assert sb.status_code == 200
    assert sb.json()["id"] == str(user.id)


@pytest.mark.asyncio
async def test_unverified_email_never_links_to_someone_elses_account(
    client: AsyncClient, extra_issuer
):
    await _existing_user("victim@example.com")
    token = _extra_token("wos-attacker", "victim@example.com", verified=False)
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 409
    async with TestingSessionLocal() as db:
        rows = (
            (await db.execute(select(UserIdentity).where(UserIdentity.subject == "wos-attacker")))
            .scalars()
            .all()
        )
        assert rows == []


@pytest.mark.asyncio
async def test_unknown_email_creates_a_new_member_account(client: AsyncClient, extra_issuer):
    token = _extra_token("wos-new", "fresh@example.com")
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "fresh@example.com"
    assert me.json()["role"] == "ENGINEER"


@pytest.mark.asyncio
async def test_wrong_audience_or_issuer_is_rejected(client: AsyncClient, extra_issuer):
    bad_aud = _extra_token("wos-1", "a@example.com", aud="other")
    assert (
        await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bad_aud}"})
    ).status_code == 401
    bad_iss = _extra_token("wos-1", "a@example.com", iss="https://evil.example/issuer")
    assert (
        await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bad_iss}"})
    ).status_code == 401


@pytest.mark.asyncio
async def test_rollback_by_removing_the_issuer(client: AsyncClient, extra_issuer, monkeypatch):
    token = _extra_token("wos-roll", "roll@example.com")
    assert (
        await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    ).status_code == 200
    monkeypatch.setattr(settings, "AUTH_EXTRA_ISSUERS", "")
    assert (
        await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    ).status_code == 401
