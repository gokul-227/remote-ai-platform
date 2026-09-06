"""Regression tests for WebSocket authentication/authorization.

Covers two things found during the auth/IDOR/WebSocket security audit:

1. Both WebSocket endpoints (notifications, network messaging) previously
   authenticated tokens via `AuthService.verify_token` directly, which only
   understands this app's own HS256 tokens -- with AUTH_PROVIDER=supabase
   (the production setting), every real user's Supabase-issued (ES256)
   token would fail there and the connection would be rejected outright.
   Fixed by routing both endpoints through the same provider-aware
   `authenticate_bearer_token` helper used by the HTTP `get_current_user`
   dependency.
2. Ownership must still be enforced per-connection: a token that
   authenticates successfully for user A must not be usable to open user
   B's notification stream, or a conversation A isn't a participant of.

No real WebSocket protocol/transport is exercised here (this test suite has
no WebSocket-capable test client wired up) -- instead the endpoint
coroutines are called directly with a lightweight fake WebSocket, which is
sufficient to exercise the authentication/authorization branch that runs
before `websocket.accept()`.
"""

import time
import uuid
from types import SimpleNamespace
from unittest.mock import patch

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import WebSocketDisconnect
from httpx import AsyncClient

from app.core.config import settings
from app.domains.auth import supabase_auth
from app.domains.notifications.router import notification_websocket
from app.domains.network.router import websocket_messages
from conftest import TestingSessionLocal

_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
_PUBLIC_KEY = _PRIVATE_KEY.public_key()


def _make_supabase_token(sub: str) -> str:
    now = int(time.time())
    claims = {
        "sub": sub,
        "email": f"{sub}@example.com",
        "aud": "authenticated",
        "role": "authenticated",
        "iss": "https://test-project.supabase.co/auth/v1",
        "iat": now,
        "exp": now + 3600,
    }
    return jwt.encode(claims, _PRIVATE_KEY, algorithm="ES256")


class FakeWebSocket:
    """Just enough of the WebSocket interface for the auth-gate branch."""

    def __init__(self):
        self.accepted = False
        self.closed_with: int | None = None
        self.sent: list[dict] = []

    async def accept(self):
        self.accepted = True

    async def close(self, code: int = 1000):
        self.closed_with = code

    async def send_json(self, data: dict):
        self.sent.append(data)

    async def receive_text(self):
        # End the connection loop immediately after any successful accept.
        raise WebSocketDisconnect()


@pytest.fixture(autouse=True)
def _ws_endpoints_use_test_db(monkeypatch):
    """Both WebSocket endpoints open their own DB session via
    `AsyncSessionFactory` (they run outside the request/response cycle, so
    they can't use the `get_db` FastAPI dependency the test suite overrides
    with the SQLite test engine) -- repoint that name at the same
    SQLite-backed session factory the rest of the test suite uses, so users
    created through the `client` fixture in these tests are visible to the
    WebSocket endpoints too.
    """
    import app.domains.network.router as network_router
    import app.domains.notifications.router as notifications_router

    monkeypatch.setattr(network_router, "AsyncSessionFactory", TestingSessionLocal)
    monkeypatch.setattr(notifications_router, "AsyncSessionFactory", TestingSessionLocal)


async def register(client: AsyncClient, email: str, role: str = "ENGINEER") -> tuple[str, str]:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "secure-pass", "full_name": email.split("@")[0], "role": role},
    )
    body = response.json()
    return body["access_token"], body["user"]["id"]


@pytest.mark.asyncio
async def test_notification_ws_rejects_token_for_a_different_user(client: AsyncClient):
    """A valid token for user A must not open user B's notification stream."""
    token_a, _user_a_id = await register(client, "ws-notif-a@example.com")
    _, user_b_id = await register(client, "ws-notif-b@example.com")

    ws = FakeWebSocket()
    await notification_websocket(ws, uuid.UUID(user_b_id), token=token_a)

    assert ws.closed_with == 4401
    assert ws.accepted is False


@pytest.mark.asyncio
async def test_notification_ws_accepts_own_token(client: AsyncClient):
    token_a, user_a_id = await register(client, "ws-notif-self@example.com")

    ws = FakeWebSocket()
    await notification_websocket(ws, uuid.UUID(user_a_id), token=token_a)

    assert ws.accepted is True
    assert ws.sent and ws.sent[0]["type"] == "ping"


@pytest.mark.asyncio
async def test_notification_ws_accepts_supabase_token_when_auth_provider_is_supabase(
    client: AsyncClient, monkeypatch
):
    """Regression test: previously this endpoint only ever verified this
    app's own HS256 tokens via AuthService.verify_token, so with
    AUTH_PROVIDER=supabase (the production setting) a real Supabase-issued
    token would always be rejected here, breaking real-time notifications
    for every production user."""
    monkeypatch.setattr(settings, "AUTH_PROVIDER", "supabase")
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://test-project.supabase.co")
    fake_jwks = SimpleNamespace(get_signing_key_from_jwt=lambda token: SimpleNamespace(key=_PUBLIC_KEY))

    with patch.object(supabase_auth, "_jwks_client", fake_jwks):
        sub = str(uuid.uuid4())
        token = _make_supabase_token(sub)
        # First HTTP call auto-provisions the local user for this Supabase identity.
        me_resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_resp.status_code == 200
        user_id = me_resp.json()["id"]

        ws = FakeWebSocket()
        await notification_websocket(ws, uuid.UUID(user_id), token=token)

    assert ws.accepted is True


@pytest.mark.asyncio
async def test_network_ws_rejects_non_participant(client: AsyncClient):
    token_a, _user_a_id = await register(client, "ws-net-a@example.com")
    _, user_b_id = await register(client, "ws-net-b@example.com")
    await register(client, "ws-net-outsider@example.com")

    conv = await client.post(
        "/api/v1/conversations",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"participant_id": user_b_id},
    )
    assert conv.status_code == 201
    conversation_id = uuid.UUID(conv.json()["id"])

    # outsider has a perfectly valid token, just for a user with no part in this conversation
    outsider_token = (await client.post(
        "/api/v1/auth/login",
        json={"email": "ws-net-outsider@example.com", "password": "secure-pass"},
    )).json()["access_token"]

    ws = FakeWebSocket()
    await websocket_messages(ws, conversation_id, token=outsider_token)

    assert ws.closed_with == 4401
    assert ws.accepted is False
