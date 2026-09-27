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
async def test_a_deliberate_new_sign_in_after_deletion_starts_a_fresh_account(client: AsyncClient):
    from datetime import UTC, datetime, timedelta

    from conftest import TestingSessionLocal

    from app.domains.auth.models import DeletedIdentity, identity_hash

    sub, email = await _signed_in(client)
    assert (await _delete(client, mint_token(sub, email, issued_at=int(time.time()) - 5))).status_code == 204
    # Pretend the deletion happened a minute ago; a token minted since then is a new sign-in.
    async with TestingSessionLocal() as db:
        row = await db.get(DeletedIdentity, identity_hash(sub))
        row.deleted_at = datetime.now(UTC) - timedelta(minutes=1)
        await db.commit()

    fresh = mint_token(sub, email, issued_at=int(time.time()) - 5)
    resp = await client.get("/api/v1/auth/me", headers=_bearer(fresh))
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "Member"


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
