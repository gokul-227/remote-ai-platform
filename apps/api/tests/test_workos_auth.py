"""WorkOS AuthKit migration: token verification next to Supabase, identity
linking by verified email only (never touching users.auth_subject), the
proxied sign-in endpoints, provider switches, and WorkOS user erasure."""

import json
import time
import uuid
from types import SimpleNamespace

import httpx
import jwt
import pytest
from auth_support import mint_token
from conftest import TestingSessionLocal
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.core.rate_limiter import route_class
from app.domains.auth import supabase_auth, workos_client
from app.domains.auth.models import DeletedIdentity, User, UserIdentity, UserRole, identity_hash

CLIENT_ID = "client_TEST123"
ISSUER = f"https://api.workos.com/user_management/{CLIENT_ID}"
_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def wos_token(
    sub: str = "user_01ABC",
    *,
    iss: str = ISSUER,
    key=_KEY,
    aud: str | None = None,
    exp_in: int = 300,
    iat: int | None = None,
    extra: dict | None = None,
) -> str:
    now = iat if iat is not None else int(time.time())
    claims: dict = {"sub": sub, "sid": "session_01XYZ", "iss": iss, "iat": now, "exp": now + exp_in}
    if aud is not None:
        claims["aud"] = aud
    claims.update(extra or {})
    return jwt.encode(claims, key, algorithm="RS256")


class FakeWorkOS:
    """In-memory WorkOS User Management API behind httpx.MockTransport."""

    def __init__(self) -> None:
        self.users: dict[str, dict] = {}
        self.calls: list[tuple[str, str]] = []
        self.fail_status: int | None = None
        self.sessions_revoked: list[str] = []

    def add(self, uid: str, email: str, verified: bool = True) -> None:
        self.users[uid] = {"id": uid, "email": email, "email_verified": verified}

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        self.calls.append((request.method, path))
        if self.fail_status:
            return httpx.Response(self.fail_status, json={"code": "boom"})
        if path.startswith("/user_management/users/") and path.endswith("/sessions"):
            return httpx.Response(200, json={"data": [{"id": "session_A", "status": "active"}]})
        if path.startswith("/user_management/users/"):
            uid = path.rsplit("/", 1)[1]
            if request.method == "DELETE":
                return httpx.Response(200 if self.users.pop(uid, None) else 404)
            user = self.users.get(uid)
            return httpx.Response(200, json=user) if user else httpx.Response(404, json={})
        if path == "/user_management/magic_auth":
            return httpx.Response(201, json={"id": "magic_auth_1", "code": "999999"})
        if path == "/user_management/authenticate":
            body = json.loads(request.content)
            if (
                str(body.get("code", "")).startswith("bad")
                or body.get("refresh_token") == "expired-refresh"
            ):
                return httpx.Response(400, json={"error": "invalid_grant"})
            return httpx.Response(
                200,
                json={
                    "access_token": wos_token(),
                    "refresh_token": "new-refresh",
                    "user": {"id": "user_01ABC", "email": "x@example.com"},
                },
            )
        if path == "/user_management/sessions/revoke":
            self.sessions_revoked.append(json.loads(request.content)["session_id"])
            return httpx.Response(200, json={})
        return httpx.Response(404)


@pytest.fixture
def workos(monkeypatch):
    fake = FakeWorkOS()
    monkeypatch.setattr(settings, "WORKOS_CLIENT_ID", CLIENT_ID)
    monkeypatch.setattr(settings, "WORKOS_API_KEY", "sk_test_dummy")
    monkeypatch.setattr(settings, "WORKOS_ISSUERS_RAW", "")
    monkeypatch.setattr(
        supabase_auth,
        "_workos_jwks_client",
        SimpleNamespace(get_signing_key_from_jwt=lambda t: SimpleNamespace(key=_KEY.public_key())),
    )
    monkeypatch.setattr(workos_client, "transport", httpx.MockTransport(fake.handler))
    return fake


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def existing_user(email: str) -> User:
    async with TestingSessionLocal() as db:
        user = User(
            email=email,
            full_name="Existing",
            role=UserRole.ENGINEER,
            auth_subject=str(uuid.uuid4()),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


# ── token verification ──────────────────────────────────────────────────────


def test_workos_token_verifies_and_carries_session(workos):
    ident = supabase_auth.verify_access_token(wos_token(aud=CLIENT_ID))
    assert ident.provider == "workos"
    assert ident.user_id == "user_01ABC"
    assert ident.session_id == "session_01XYZ"
    assert ident.email is None
    assert ident.verify_email_with_provider


def test_generic_workos_issuer_is_accepted(workos):
    assert (
        supabase_auth.verify_access_token(wos_token(iss="https://api.workos.com/")).provider
        == "workos"
    )


def test_custom_issuer_list_replaces_defaults(workos, monkeypatch):
    monkeypatch.setattr(settings, "WORKOS_ISSUERS_RAW", "https://auth.remoteaiplatform.com")
    assert supabase_auth.verify_access_token(wos_token(iss="https://auth.remoteaiplatform.com"))
    with pytest.raises(HTTPException):
        supabase_auth.verify_access_token(wos_token())


@pytest.mark.parametrize(
    "token_kwargs",
    [
        {"key": _OTHER_KEY},  # signed by someone else
        {"aud": "client_OTHER"},  # issued for another client
        {"exp_in": -10},  # expired
    ],
)
def test_bad_workos_tokens_are_rejected(workos, token_kwargs):
    token = wos_token(**token_kwargs)
    with pytest.raises(HTTPException) as err:
        supabase_auth.verify_access_token(token)
    assert getattr(err.value, "status_code", None) == 401


def test_workos_verifier_rejects_wrong_issuer_directly(workos):
    with pytest.raises(HTTPException) as err:
        supabase_auth.verify_workos_token(wos_token(iss="https://evil.example"))
    assert err.value.status_code == 401


def test_unknown_issuer_is_rejected_when_workos_enabled(workos):
    with pytest.raises(HTTPException) as err:
        supabase_auth.verify_access_token(wos_token(iss="https://evil.example"))
    assert err.value.status_code == 401


def test_email_claim_from_jwt_template_counts_only_when_verified(workos):
    ident = supabase_auth.verify_access_token(
        wos_token(extra={"email": "a@example.com", "email_verified": True})
    )
    assert ident.email_verified
    assert not ident.verify_email_with_provider
    ident = supabase_auth.verify_access_token(wos_token(extra={"email": "a@example.com"}))
    assert not ident.email_verified
    assert ident.verify_email_with_provider


def test_garbage_token_is_401(workos):
    with pytest.raises(HTTPException) as err:
        supabase_auth.verify_access_token("not-a-jwt")
    assert err.value.status_code == 401


@pytest.mark.asyncio
async def test_supabase_tokens_still_work_during_transition(client: AsyncClient, workos):
    sub = str(uuid.uuid4())
    res = await client.get("/api/v1/auth/me", headers=bearer(mint_token(sub, "sb@example.com")))
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_supabase_acceptance_can_be_turned_off(client: AsyncClient, workos, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_ACCEPT_SUPABASE", False)
    res = await client.get(
        "/api/v1/auth/me", headers=bearer(mint_token(str(uuid.uuid4()), "o@example.com"))
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_supabase_off_without_workos_rejects_everything(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_ACCEPT_SUPABASE", False)
    res = await client.get(
        "/api/v1/auth/me", headers=bearer(mint_token(str(uuid.uuid4()), "o@example.com"))
    )
    assert res.status_code == 401


# ── identity linking ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_verified_workos_email_links_existing_account_without_touching_auth_subject(
    client: AsyncClient, workos
):
    user = await existing_user("Member@Example.com")
    workos.add("user_01LINK", "member@example.com", verified=True)
    token = wos_token("user_01LINK")
    res = await client.get("/api/v1/auth/me", headers=bearer(token))
    assert res.status_code == 200, res.text
    assert res.json()["id"] == str(user.id)
    # Second request uses the stored link: no further WorkOS lookup.
    lookups = len(workos.calls)
    assert (await client.get("/api/v1/auth/me", headers=bearer(token))).json()["id"] == str(user.id)
    assert len(workos.calls) == lookups
    async with TestingSessionLocal() as db:
        rows = (await db.scalars(select(UserIdentity).where(UserIdentity.user_id == user.id))).all()
        assert [(r.provider, r.subject) for r in rows] == [("workos", "user_01LINK")]
        assert (await db.get(User, user.id)).auth_subject == user.auth_subject  # type: ignore[union-attr]
    # The Supabase session of the same account keeps working.
    sb = await client.get(
        "/api/v1/auth/me", headers=bearer(mint_token(user.auth_subject, user.email))
    )
    assert sb.json()["id"] == str(user.id)


@pytest.mark.asyncio
async def test_unverified_workos_email_never_links(client: AsyncClient, workos):
    await existing_user("victim@example.com")
    workos.add("user_01EVIL", "victim@example.com", verified=False)
    res = await client.get("/api/v1/auth/me", headers=bearer(wos_token("user_01EVIL")))
    assert res.status_code == 409
    async with TestingSessionLocal() as db:
        assert (await db.scalars(select(UserIdentity))).all() == []


@pytest.mark.asyncio
async def test_unverified_email_claim_in_token_is_ignored_and_api_decides(
    client: AsyncClient, workos
):
    """A token's own unverified email claim never links; the API's verified flag does."""
    user = await existing_user("claim@example.com")
    workos.add("user_01CLM", "claim@example.com", verified=True)
    res = await client.get(
        "/api/v1/auth/me",
        headers=bearer(wos_token("user_01CLM", extra={"email": "claim@example.com"})),
    )
    assert res.json()["id"] == str(user.id)


@pytest.mark.asyncio
async def test_new_workos_signup_creates_member(client: AsyncClient, workos):
    workos.add("user_01NEW", "new@example.com")
    res = await client.get("/api/v1/auth/me", headers=bearer(wos_token("user_01NEW")))
    assert res.status_code == 200
    assert res.json()["email"] == "new@example.com"
    assert res.json()["role"] == "ENGINEER"
    async with TestingSessionLocal() as db:
        created = await db.scalar(select(User).where(User.email == "new@example.com"))
        assert created is not None
        assert created.auth_subject is None


@pytest.mark.asyncio
async def test_workos_lookup_failure_fails_closed(client: AsyncClient, workos):
    await existing_user("down@example.com")
    workos.fail_status = 500
    res = await client.get("/api/v1/auth/me", headers=bearer(wos_token("user_01DOWN")))
    assert res.status_code == 503
    async with TestingSessionLocal() as db:
        assert (await db.scalars(select(UserIdentity))).all() == []


@pytest.mark.asyncio
async def test_workos_lookup_without_api_key_fails_closed(client: AsyncClient, workos, monkeypatch):
    monkeypatch.setattr(settings, "WORKOS_API_KEY", "")
    res = await client.get("/api/v1/auth/me", headers=bearer(wos_token("user_01NOKEY")))
    assert res.status_code in (401, 503)


@pytest.mark.asyncio
async def test_deleted_workos_identity_cannot_recreate_account(client: AsyncClient, workos):
    workos.add("user_01GONE", "gone@example.com")
    token = wos_token("user_01GONE", iat=int(time.time()) - 5)
    assert (await client.get("/api/v1/auth/me", headers=bearer(token))).status_code == 200
    res = await client.request(
        "DELETE", "/api/v1/auth/me", headers=bearer(token), json={"confirm": "DELETE"}
    )
    assert res.status_code == 204
    # WorkOS user erased, tombstone recorded as done.
    assert ("DELETE", "/user_management/users/user_01GONE") in workos.calls
    async with TestingSessionLocal() as db:
        tomb = await db.get(DeletedIdentity, identity_hash("user_01GONE", "workos"))
        assert tomb is not None
        assert tomb.provider == "workos"
        assert tomb.pending_subject is None
        assert tomb.provider_erased_at is not None
    again = await client.get("/api/v1/auth/me", headers=bearer(wos_token("user_01GONE")))
    assert again.status_code == 401


@pytest.mark.asyncio
async def test_deleting_linked_account_erases_both_providers(
    client: AsyncClient, workos, monkeypatch
):
    from app.domains.auth import supabase_admin

    erased: list[str] = []

    async def fake_sb_delete(subject: str) -> bool:
        erased.append(subject)
        return True

    monkeypatch.setattr(supabase_admin, "delete_identity", fake_sb_delete)
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
    user = await existing_user("both@example.com")
    workos.add("user_01BOTH", "both@example.com")
    token = wos_token("user_01BOTH", iat=int(time.time()) - 5)
    assert (await client.get("/api/v1/auth/me", headers=bearer(token))).status_code == 200
    res = await client.request(
        "DELETE", "/api/v1/auth/me", headers=bearer(token), json={"confirm": "DELETE"}
    )
    assert res.status_code == 204
    assert erased == [user.auth_subject]
    assert "user_01BOTH" not in workos.users


@pytest.mark.asyncio
async def test_failed_workos_erasure_is_retried(client: AsyncClient, workos):
    from app.domains.auth.erasure import retry_pending_erasures

    workos.add("user_01RETRY", "retry@example.com")
    token = wos_token("user_01RETRY", iat=int(time.time()) - 5)
    assert (await client.get("/api/v1/auth/me", headers=bearer(token))).status_code == 200
    workos.fail_status = 503
    res = await client.request(
        "DELETE", "/api/v1/auth/me", headers=bearer(token), json={"confirm": "DELETE"}
    )
    assert res.status_code == 204
    async with TestingSessionLocal() as db:
        tomb = await db.get(DeletedIdentity, identity_hash("user_01RETRY", "workos"))
        assert tomb is not None
        assert tomb.pending_subject == "user_01RETRY"
        assert tomb.last_error
    workos.fail_status = None
    async with TestingSessionLocal() as db:
        assert await retry_pending_erasures(db) == {"erased": 1, "pending": 0}


# ── proxied sign-in endpoints ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_config_reports_primary_provider(client: AsyncClient, workos, monkeypatch):
    cfg = (await client.get("/api/v1/auth/workos/config")).json()
    assert cfg["primary"] == "supabase"
    assert cfg["workos_client_id"] == CLIENT_ID
    monkeypatch.setattr(settings, "AUTH_PRIMARY_PROVIDER", "workos")
    cfg = (await client.get("/api/v1/auth/workos/config")).json()
    assert cfg["primary"] == "workos"
    assert set(cfg["oauth_providers"]) == {"google", "github", "microsoft", "linkedin"}


@pytest.mark.asyncio
async def test_endpoints_are_off_without_workos(client: AsyncClient):
    assert (await client.get("/api/v1/auth/workos/config")).json()["primary"] == "supabase"
    res = await client.post("/api/v1/auth/workos/magic-auth/send", json={"email": "a@example.com"})
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_send_code_never_returns_the_code(client: AsyncClient, workos):
    res = await client.post("/api/v1/auth/workos/magic-auth/send", json={"email": "A@Example.com"})
    assert res.status_code == 204
    assert res.content == b""
    assert ("POST", "/user_management/magic_auth") in workos.calls


@pytest.mark.asyncio
async def test_staff_send_skips_unknown_addresses(client: AsyncClient, workos):
    res = await client.post(
        "/api/v1/auth/workos/magic-auth/send",
        json={"email": "nobody@example.com", "existing_only": True},
    )
    assert res.status_code == 204
    assert workos.calls == []
    await existing_user("staff@example.com")
    await client.post(
        "/api/v1/auth/workos/magic-auth/send",
        json={"email": "staff@example.com", "existing_only": True},
    )
    assert workos.calls == [("POST", "/user_management/magic_auth")]


@pytest.mark.asyncio
async def test_send_code_refusal_is_not_revealed_but_outage_is(client: AsyncClient, workos):
    workos.fail_status = 422
    assert (
        await client.post("/api/v1/auth/workos/magic-auth/send", json={"email": "a@example.com"})
    ).status_code == 204
    workos.fail_status = 500
    assert (
        await client.post("/api/v1/auth/workos/magic-auth/send", json={"email": "a@example.com"})
    ).status_code == 503


@pytest.mark.asyncio
async def test_verify_code(client: AsyncClient, workos):
    ok = await client.post(
        "/api/v1/auth/workos/magic-auth/verify", json={"email": "a@example.com", "code": "123456"}
    )
    assert ok.status_code == 200
    assert set(ok.json()) == {"access_token", "refresh_token", "token_type"}
    bad = await client.post(
        "/api/v1/auth/workos/magic-auth/verify", json={"email": "a@example.com", "code": "bad0"}
    )
    assert bad.status_code == 400


@pytest.mark.asyncio
async def test_verify_wrong_code_is_400(client: AsyncClient, workos, monkeypatch):
    async def refuse(email: str, code: str):
        raise workos_client.WorkOSError(400, "invalid_grant")

    monkeypatch.setattr(workos_client, "verify_magic_auth_code", refuse)
    res = await client.post(
        "/api/v1/auth/workos/magic-auth/verify", json={"email": "a@example.com", "code": "111111"}
    )
    assert res.status_code == 400
    assert "expired" in res.json()["detail"]


@pytest.mark.asyncio
async def test_authorize_only_to_own_callback(client: AsyncClient, workos, monkeypatch):
    monkeypatch.setattr(settings, "CORS_ORIGINS_RAW", "https://remoteaiplatform.com")
    body = {
        "provider": "google",
        "redirect_uri": "https://remoteaiplatform.com/auth/callback",
        "state": "s" * 20,
    }
    res = await client.post(
        "/api/v1/auth/workos/authorize", json={**body, "code_challenge": "c" * 43}
    )
    assert res.status_code == 200
    url = res.json()["url"]
    assert url.startswith("https://api.workos.com/user_management/authorize?")
    for part in ("provider=GoogleOAuth", f"client_id={CLIENT_ID}", "code_challenge_method=S256"):
        assert part in url
    for bad in (
        "https://evil.example/auth/callback",
        "https://remoteaiplatform.com/elsewhere",
        "https://remoteaiplatform.com/auth/callback?x=1",
    ):
        assert (
            await client.post("/api/v1/auth/workos/authorize", json={**body, "redirect_uri": bad})
        ).status_code == 422
    assert (
        await client.post("/api/v1/auth/workos/authorize", json={**body, "provider": "facebook"})
    ).status_code == 422


@pytest.mark.asyncio
async def test_callback_and_refresh(client: AsyncClient, workos):
    ok = await client.post("/api/v1/auth/workos/callback", json={"code": "goodcode123"})
    assert ok.status_code == 200
    assert ok.json()["refresh_token"] == "new-refresh"
    ref = await client.post("/api/v1/auth/workos/refresh", json={"refresh_token": "some-refresh"})
    assert ref.status_code == 200
    expired = await client.post(
        "/api/v1/auth/workos/refresh", json={"refresh_token": "expired-refresh"}
    )
    assert expired.status_code == 401


@pytest.mark.asyncio
async def test_callback_errors(client: AsyncClient, workos, monkeypatch):
    async def refuse(code, verifier=None):
        raise workos_client.WorkOSError(400)

    monkeypatch.setattr(workos_client, "exchange_code", refuse)
    assert (
        await client.post("/api/v1/auth/workos/callback", json={"code": "goodcode123"})
    ).status_code == 400
    workos.fail_status = 502
    monkeypatch.undo()
    monkeypatch.setattr(settings, "WORKOS_CLIENT_ID", CLIENT_ID)
    monkeypatch.setattr(settings, "WORKOS_API_KEY", "sk_test_dummy")
    monkeypatch.setattr(workos_client, "transport", httpx.MockTransport(workos.handler))
    assert (
        await client.post("/api/v1/auth/workos/callback", json={"code": "goodcode123"})
    ).status_code == 503
    assert (
        await client.post("/api/v1/auth/workos/refresh", json={"refresh_token": "some-refresh"})
    ).status_code == 503


@pytest.mark.asyncio
async def test_logout_revokes_this_or_every_session(client: AsyncClient, workos):
    token = wos_token()
    assert (
        await client.post("/api/v1/auth/workos/logout", json={}, headers=bearer(token))
    ).status_code == 204
    assert workos.sessions_revoked == ["session_01XYZ"]
    await client.post(
        "/api/v1/auth/workos/logout", json={"everywhere": True}, headers=bearer(token)
    )
    assert workos.sessions_revoked[-1] == "session_A"
    # No token, a bad token, or a Supabase token: nothing to revoke at WorkOS.
    assert (await client.post("/api/v1/auth/workos/logout", json={})).status_code == 204
    assert (
        await client.post("/api/v1/auth/workos/logout", json={}, headers=bearer("junk"))
    ).status_code == 204
    sb = mint_token(str(uuid.uuid4()), "s@example.com")
    assert (
        await client.post("/api/v1/auth/workos/logout", json={}, headers=bearer(sb))
    ).status_code == 204
    workos.fail_status = 500
    assert (
        await client.post("/api/v1/auth/workos/logout", json={}, headers=bearer(token))
    ).status_code == 204


# ── client, config, limits ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_client_rejects_non_workos_ids(workos):
    with pytest.raises(ValueError, match="invalid WorkOS id"):
        await workos_client.delete_identity("../../etc")
    assert await workos_client.delete_identity("user_01MISSING") is True  # 404 = already gone


def test_rate_limit_classes():
    assert route_class("/api/v1/auth/workos/magic-auth/send", "POST") == "sensitive"
    assert route_class("/api/v1/auth/workos/magic-auth/verify", "POST") == "sensitive"
    assert route_class("/api/v1/auth/workos/refresh", "POST") == "auth-session"


def test_primary_provider_needs_workos(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_PRIMARY_PROVIDER", "workos")
    monkeypatch.setattr(settings, "WORKOS_CLIENT_ID", "")
    assert settings.auth_primary_provider == "supabase"


def test_production_validation_of_switches(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "AUTH_ACCEPT_SUPABASE", False)
    monkeypatch.setattr(settings, "WORKOS_CLIENT_ID", "")
    monkeypatch.setattr(settings, "AUTH_PRIMARY_PROVIDER", "workos")
    with pytest.raises(RuntimeError) as err:
        settings.validate_production_settings()
    assert "AUTH_ACCEPT_SUPABASE=false" in str(err.value)
    assert "AUTH_PRIMARY_PROVIDER=workos" in str(err.value)
