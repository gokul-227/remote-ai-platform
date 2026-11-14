"""Browser push: device registration, preference gating, outbox -> worker delivery,
FCM auth and dead-token revocation. FCM is faked with httpx.MockTransport."""

import base64
import json
import uuid

import httpx
import pytest
from conftest import TestingSessionLocal
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.domains.auth.models import User, UserRole
from app.domains.notifications import push as push_mod
from app.domains.notifications.models import NotificationPreference, PushSubscription
from app.domains.tasks.models import OutboxEvent
from app.services.notifications.service import notify_user

TOKEN = "fcm-device-token-" + "x" * 40


@pytest.fixture
def fcm(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    sa = {"client_email": "push@rap-test.iam.gserviceaccount.com", "private_key": pem}
    monkeypatch.setattr(settings, "FCM_PROJECT_ID", "rap-test")
    monkeypatch.setattr(
        settings, "FCM_CREDENTIALS_B64", base64.b64encode(json.dumps(sa).encode()).decode()
    )
    monkeypatch.setattr(settings, "FCM_VAPID_KEY", "public-vapid-key")
    monkeypatch.setitem(push_mod._cached, "token", None)
    monkeypatch.setitem(push_mod._cached, "expires", 0.0)


async def _user(email: str) -> User:
    async with TestingSessionLocal() as db:
        u = User(email=email, full_name="P", role=UserRole.ENGINEER, auth_subject=str(uuid.uuid4()))
        db.add(u)
        await db.commit()
        await db.refresh(u)
        return u


@pytest.mark.asyncio
async def test_config_and_subscription_endpoints(
    client: AsyncClient, engineer_token: str, monkeypatch
):
    h = {"Authorization": f"Bearer {engineer_token}"}
    monkeypatch.setattr(settings, "FCM_PROJECT_ID", "")
    assert (await client.get("/api/v1/notifications/push/config", headers=h)).json() == {
        "enabled": False,
        "vapid_key": None,
    }
    monkeypatch.setattr(settings, "FCM_PROJECT_ID", "p")
    monkeypatch.setattr(settings, "FCM_CREDENTIALS_B64", "e30=")
    monkeypatch.setattr(settings, "FCM_VAPID_KEY", "pub")
    assert (await client.get("/api/v1/notifications/push/config", headers=h)).json() == {
        "enabled": True,
        "vapid_key": "pub",
    }
    assert (
        await client.post(
            "/api/v1/notifications/push/subscriptions", json={"token": "short"}, headers=h
        )
    ).status_code == 422
    assert (
        await client.post(
            "/api/v1/notifications/push/subscriptions", json={"token": TOKEN}, headers=h
        )
    ).status_code == 204
    assert (
        await client.post(
            "/api/v1/notifications/push/subscriptions", json={"token": TOKEN}, headers=h
        )
    ).status_code == 204
    async with TestingSessionLocal() as db:
        rows = (await db.execute(select(PushSubscription))).scalars().all()
        assert len(rows) == 1
        assert rows[0].revoked_at is None
    assert (
        await client.request(
            "DELETE", "/api/v1/notifications/push/subscriptions", json={"token": TOKEN}, headers=h
        )
    ).status_code == 204
    async with TestingSessionLocal() as db:
        assert (await db.execute(select(PushSubscription))).scalar_one().revoked_at is not None


@pytest.mark.asyncio
async def test_only_email_worthy_events_queue_push_and_preferences_apply(fcm):
    u = await _user("push-pref@example.com")
    async with TestingSessionLocal() as db:
        db.add(PushSubscription(user_id=u.id, token=TOKEN))
        await db.commit()
    async with TestingSessionLocal() as db:
        await notify_user(
            db, u.id, "Liked", "Someone liked your post", "post_like"
        )  # minor: no push
        await notify_user(
            db,
            u.id,
            "Offer",
            "You have a contract offer",
            "contract_offer",
            email_event_key="c1",
            email_link="#contracts",
        )
        await db.commit()
        events = (
            (await db.execute(select(OutboxEvent).where(OutboxEvent.event_type == "push.notify")))
            .scalars()
            .all()
        )
        assert len(events) == 1
        assert events[0].payload["title"] == "Offer"
        assert events[0].payload["link"] == "#contracts"
        db.add(
            NotificationPreference(
                user_id=u.id, categories={"contract": {"push": False}}, digest_minutes=15
            )
        )
        await db.commit()
        await notify_user(
            db, u.id, "Offer 2", "Another offer", "contract_offer", email_event_key="c2"
        )
        await db.commit()
        assert (
            len(
                (
                    await db.execute(
                        select(OutboxEvent).where(OutboxEvent.event_type == "push.notify")
                    )
                )
                .scalars()
                .all()
            )
            == 1
        )


@pytest.mark.asyncio
async def test_no_push_without_configuration_or_devices(monkeypatch):
    u = await _user("push-none@example.com")
    monkeypatch.setattr(settings, "FCM_PROJECT_ID", "")
    async with TestingSessionLocal() as db:
        db.add(PushSubscription(user_id=u.id, token=TOKEN))
        await db.commit()
        await notify_user(db, u.id, "Offer", "b", "contract_offer", email_event_key="n1")
        await db.commit()
        assert (
            await db.execute(select(OutboxEvent).where(OutboxEvent.event_type == "push.notify"))
        ).scalars().all() == []


@pytest.mark.asyncio
async def test_send_push_authenticates_delivers_and_revokes_dead_tokens(fcm):
    u = await _user("push-send@example.com")
    async with TestingSessionLocal() as db:
        db.add(PushSubscription(user_id=u.id, token=TOKEN))
        db.add(PushSubscription(user_id=u.id, token="dead-" + TOKEN))
        await db.commit()
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth2.googleapis.com":
            form = dict(x.split("=", 1) for x in request.content.decode().split("&"))
            assert form["grant_type"].startswith("urn")
            return httpx.Response(200, json={"access_token": "oauth-token", "expires_in": 3600})
        assert request.headers["authorization"] == "Bearer oauth-token"
        assert request.url.path == "/v1/projects/rap-test/messages:send"
        body = json.loads(request.content)
        seen.append(body)
        if body["message"]["token"].startswith("dead-"):
            return httpx.Response(
                404,
                json={"error": {"status": "NOT_FOUND", "details": [{"errorCode": "UNREGISTERED"}]}},
            )
        return httpx.Response(200, json={"name": "projects/rap-test/messages/1"})

    async with (
        httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http,
        TestingSessionLocal() as db,
    ):
        result = await push_mod.send_push(
            db, u.id, "Offer", "You have an offer", "#contracts", http=http
        )
    assert result == {"sent": 1, "skipped": 0, "revoked": 1}
    assert {m["message"]["notification"]["title"] for m in seen} == {"Offer"}
    assert seen[0]["message"]["webpush"]["fcm_options"]["link"].endswith("/#contracts")
    async with TestingSessionLocal() as db:
        rows = {
            s.token: s.revoked_at
            for s in (await db.execute(select(PushSubscription))).scalars().all()
        }
        assert rows[TOKEN] is None
        assert rows["dead-" + TOKEN] is not None
