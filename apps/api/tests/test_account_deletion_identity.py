"""DATA-01: deleting an account must end that identity's access to the app.

Before: DELETE /auth/me removed the app rows, but the caller's still-valid
access token (or a refreshed one) went straight back through
get_or_create_user and silently provisioned a new blank account, and the
Supabase user (email, OAuth links) was never erased.
"""

import time
import uuid

import pytest
from auth_support import mint_token
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _signed_in(client: AsyncClient) -> tuple[str, str]:
    sub, email = str(uuid.uuid4()), f"leaver-{uuid.uuid4().hex[:8]}@example.com"
    token = mint_token(sub, email, issued_at=int(time.time()) - 5)
    assert (await client.get("/api/v1/auth/me", headers=_bearer(token))).status_code == 200
    return sub, email


async def _delete(client: AsyncClient, token: str):
    return await client.request("DELETE", "/api/v1/auth/me", headers=_bearer(token), json={"confirm": "DELETE"})


@pytest.mark.asyncio
async def test_old_token_cannot_recreate_a_deleted_account(client: AsyncClient):
    from conftest import TestingSessionLocal

    from app.domains.auth.models import User

    sub, email = await _signed_in(client)
    old_token = mint_token(sub, email, issued_at=int(time.time()) - 5)
    assert (await _delete(client, old_token)).status_code == 204

    again = await client.get("/api/v1/auth/me", headers=_bearer(old_token))
    assert again.status_code == 401
    async with TestingSessionLocal() as db:
        assert await db.scalar(select(User).where(User.auth_subject == sub)) is None


@pytest.mark.asyncio
async def test_signing_up_again_starts_a_fresh_account(client: AsyncClient):
    """Re-registration policy: a new sign-up is a new Supabase user, i.e. a new subject."""
    sub, email = await _signed_in(client)
    assert (await _delete(client, mint_token(sub, email, issued_at=int(time.time()) - 5))).status_code == 204

    new_sub = str(uuid.uuid4())
    resp = await client.get("/api/v1/auth/me", headers=_bearer(mint_token(new_sub, email)))
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "Member"


@pytest.mark.asyncio
async def test_refreshed_old_session_cannot_recreate_the_account_when_supabase_erasure_failed(
    client: AsyncClient, monkeypatch
):
    """DATA-04: the Supabase user survived (erasure failed), so its refresh token
    still works. A token minted from it after the deletion has a later `iat`,
    but it is the old session, not a new sign-up: it must be refused."""
    from datetime import UTC, datetime, timedelta

    from conftest import TestingSessionLocal

    from app.domains.auth import supabase_admin
    from app.domains.auth.models import DeletedIdentity, User, identity_hash

    async def failing_delete(subject: str) -> bool:
        raise RuntimeError("supabase down")

    monkeypatch.setattr(supabase_admin, "delete_identity", failing_delete)
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
    sub, email = await _signed_in(client)
    assert (await _delete(client, mint_token(sub, email, issued_at=int(time.time()) - 5))).status_code == 204
    async with TestingSessionLocal() as db:
        row = await db.get(DeletedIdentity, identity_hash(sub))
        assert row.pending_subject == sub and row.provider_attempts == 1 and row.last_error == "RuntimeError"
        row.deleted_at = datetime.now(UTC) - timedelta(minutes=5)
        await db.commit()

    refreshed = mint_token(sub, email)  # iat now, i.e. after the deletion
    assert (await client.get("/api/v1/auth/me", headers=_bearer(refreshed))).status_code == 401
    async with TestingSessionLocal() as db:
        assert await db.scalar(select(User).where(User.auth_subject == sub)) is None


@pytest.mark.asyncio
async def test_failed_supabase_erasure_is_retried_until_it_succeeds(client: AsyncClient, monkeypatch):
    from conftest import TestingSessionLocal

    from app.domains.auth import supabase_admin
    from app.domains.auth.erasure import retry_pending_erasures
    from app.domains.auth.models import DeletedIdentity, identity_hash

    up = {"ok": False}
    calls: list[str] = []

    async def flaky_delete(subject: str) -> bool:
        calls.append(subject)
        if not up["ok"]:
            raise RuntimeError("supabase down")
        return True

    monkeypatch.setattr(supabase_admin, "delete_identity", flaky_delete)
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
    sub, email = await _signed_in(client)
    assert (await _delete(client, mint_token(sub, email, issued_at=int(time.time()) - 5))).status_code == 204

    async with TestingSessionLocal() as db:
        assert await retry_pending_erasures(db) == {"erased": 0, "pending": 1}
        up["ok"] = True
        assert await retry_pending_erasures(db) == {"erased": 1, "pending": 0}
        assert await retry_pending_erasures(db) == {"erased": 0, "pending": 0}
    assert calls == [sub, sub, sub]
    async with TestingSessionLocal() as db:
        row = await db.get(DeletedIdentity, identity_hash(sub))
        # The raw subject is dropped once the provider user is gone; only the hash stays.
        assert row.pending_subject is None and row.provider_erased_at is not None and row.provider_attempts == 3


@pytest.mark.asyncio
async def test_admin_deletion_also_blocks_the_old_session_and_erases_the_identity(client: AsyncClient, monkeypatch):
    from conftest import TestingSessionLocal

    from app.domains.auth import supabase_admin
    from app.domains.auth.models import User, UserRole

    calls: list[str] = []

    async def fake_delete(subject: str) -> bool:
        calls.append(subject)
        return True

    monkeypatch.setattr(supabase_admin, "delete_identity", fake_delete)
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
    sub, email = await _signed_in(client)
    admin_sub = str(uuid.uuid4())
    admin_token = mint_token(admin_sub, f"adm-{uuid.uuid4().hex[:6]}@example.com")
    assert (await client.get("/api/v1/auth/me", headers=_bearer(admin_token))).status_code == 200
    async with TestingSessionLocal() as db:
        admin = await db.scalar(select(User).where(User.auth_subject == admin_sub))
        admin.role = UserRole.ADMIN
        target = await db.scalar(select(User).where(User.auth_subject == sub))
        await db.commit()
        target_id = target.id

    assert (await client.delete(f"/api/v1/admin/users/{target_id}", headers=_bearer(admin_token))).status_code == 204
    assert calls == [sub]
    assert (await client.get("/api/v1/auth/me", headers=_bearer(mint_token(sub, email)))).status_code == 401


@pytest.mark.asyncio
async def test_only_admins_can_retry_erasures(client: AsyncClient):
    sub, email = await _signed_in(client)
    resp = await client.post("/api/v1/admin/erasures/retry", headers=_bearer(mint_token(sub, email)))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_tombstone_stores_no_raw_identity(client: AsyncClient):
    from conftest import TestingSessionLocal

    from app.domains.auth.models import DeletedIdentity

    sub, email = await _signed_in(client)
    assert (await _delete(client, mint_token(sub, email, issued_at=int(time.time()) - 5))).status_code == 204
    async with TestingSessionLocal() as db:
        rows = (await db.scalars(select(DeletedIdentity))).all()
    assert rows
    assert all(sub not in r.subject_hash and email not in r.subject_hash for r in rows)


@pytest.mark.asyncio
async def test_supabase_user_is_erased_when_the_service_key_is_configured(client: AsyncClient, monkeypatch):
    from app.domains.auth import supabase_admin

    calls: list[str] = []

    async def fake_delete(subject: str) -> bool:
        calls.append(subject)
        return True

    monkeypatch.setattr(supabase_admin, "delete_identity", fake_delete)
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
    sub, email = await _signed_in(client)
    assert (await _delete(client, mint_token(sub, email, issued_at=int(time.time()) - 5))).status_code == 204
    assert calls == [sub]


@pytest.mark.asyncio
async def test_supabase_failure_does_not_undo_the_app_erasure(client: AsyncClient, monkeypatch):
    from conftest import TestingSessionLocal

    from app.domains.auth import supabase_admin
    from app.domains.auth.models import User

    async def failing_delete(subject: str) -> bool:
        raise RuntimeError("supabase down")

    monkeypatch.setattr(supabase_admin, "delete_identity", failing_delete)
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
    sub, email = await _signed_in(client)
    assert (await _delete(client, mint_token(sub, email, issued_at=int(time.time()) - 5))).status_code == 204
    async with TestingSessionLocal() as db:
        assert await db.scalar(select(User).where(User.auth_subject == sub)) is None


@pytest.mark.asyncio
async def test_no_supabase_call_without_the_service_key(client: AsyncClient, monkeypatch):
    from app.domains.auth import supabase_admin

    async def must_not_run(subject: str) -> bool:
        raise AssertionError("called without a service key")

    monkeypatch.setattr(supabase_admin, "delete_identity", must_not_run)
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "")
    sub, email = await _signed_in(client)
    assert (await _delete(client, mint_token(sub, email, issued_at=int(time.time()) - 5))).status_code == 204


@pytest.mark.asyncio
@pytest.mark.parametrize(("status", "ok"), [(200, True), (204, True), (404, True), (500, False)])
async def test_admin_delete_call(monkeypatch, status, ok):
    import httpx

    from app.domains.auth import supabase_admin

    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(status)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        supabase_admin.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw)
    )
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://proj.supabase.co/")
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "svc")
    subject = str(uuid.uuid4())
    if ok:
        assert await supabase_admin.delete_identity(subject) is True
    else:
        with pytest.raises(httpx.HTTPStatusError):
            await supabase_admin.delete_identity(subject)
    req = seen[0]
    assert req.method == "DELETE"
    assert str(req.url) == f"https://proj.supabase.co/auth/v1/admin/users/{subject}"
    assert req.headers["apikey"] == "svc" and req.headers["authorization"] == "Bearer svc"


@pytest.mark.asyncio
async def test_admin_delete_refuses_a_non_uuid_subject(monkeypatch):
    from app.domains.auth import supabase_admin

    monkeypatch.setattr(settings, "SUPABASE_URL", "https://proj.supabase.co")
    with pytest.raises(ValueError):
        await supabase_admin.delete_identity("../../admin/users")


def test_production_warns_when_supabase_erasure_is_not_configured(monkeypatch):
    import warnings

    from app.core.config import Settings

    monkeypatch.setenv("APP_ENV", "production")
    s = Settings(
        _env_file=None, DATABASE_URL="postgresql+asyncpg://u:p@db.example.com/x", SUPABASE_URL="https://p.supabase.co",
        MINIO_SECRET_KEY="k", MINIO_ENDPOINT="s3.example.com", MINIO_PUBLIC_ENDPOINT="s3.example.com",
        CORS_ORIGINS="https://remoteaiplatform.com", REDIS_URL="rediss://r.example.com", SUPABASE_SERVICE_ROLE_KEY="",
    )
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        s.validate_production_settings()
    assert any("SUPABASE_SERVICE_ROLE_KEY" in str(w.message) for w in caught)
