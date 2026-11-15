"""Browser push: subscription registration, preference gating, outbox -> worker
delivery, RFC 8291 encryption, VAPID auth and dead-endpoint revocation. Push
services are faked with httpx.MockTransport."""

import uuid

import httpx
import jwt
import pytest
from conftest import TestingSessionLocal
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.domains.auth.models import User, UserRole
from app.domains.notifications import push as push_mod
from app.domains.notifications.models import NotificationPreference, PushSubscription
from app.domains.tasks.models import OutboxEvent
from app.services.notifications.service import notify_user

TOKEN = "https://fcm.googleapis.com/fcm/send/device-" + "x" * 40
UA_KEY = ec.generate_private_key(ec.SECP256R1())
UA_PUB = push_mod.b64u(
    UA_KEY.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
)
AUTH = push_mod.b64u(b"0123456789abcdef")
KEYS = {"p256dh": UA_PUB, "auth": AUTH}


def _sub(user_id, endpoint=TOKEN):
    return PushSubscription(user_id=user_id, token=endpoint, p256dh=UA_PUB, auth_secret=AUTH)


@pytest.fixture
def fcm(monkeypatch):
    public, private = push_mod.generate_vapid_keys()
    monkeypatch.setattr(settings, "WEB_PUSH_VAPID_PUBLIC_KEY", public)
    monkeypatch.setattr(settings, "WEB_PUSH_VAPID_PRIVATE_KEY", private)
    return public


def decrypt(body: bytes) -> bytes:
    """Receiver side of RFC 8291 (what the browser does)."""
    salt, rs, idlen = body[:16], body[16:20], body[20]
    assert int.from_bytes(rs, "big") == 4096
    as_public = body[21 : 21 + idlen]
    record = body[21 + idlen :]
    shared = UA_KEY.exchange(
        ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), as_public)
    )
    ua_public = push_mod.b64u_decode(UA_PUB)

    def hk(salt_, ikm, info, n):
        return HKDF(algorithm=hashes.SHA256(), length=n, salt=salt_, info=info).derive(ikm)

    ikm = hk(push_mod.b64u_decode(AUTH), shared, b"WebPush: info\x00" + ua_public + as_public, 32)
    cek = hk(salt, ikm, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = hk(salt, ikm, b"Content-Encoding: nonce\x00", 12)
    plain = AESGCM(cek).decrypt(nonce, record, None)
    assert plain.endswith(b"\x02")
    return plain[:-1]


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
    monkeypatch.setattr(settings, "WEB_PUSH_VAPID_PUBLIC_KEY", "")
    assert (await client.get("/api/v1/notifications/push/config", headers=h)).json() == {
        "enabled": False,
        "vapid_key": None,
    }
    monkeypatch.setattr(settings, "WEB_PUSH_VAPID_PUBLIC_KEY", "pub")
    monkeypatch.setattr(settings, "WEB_PUSH_VAPID_PRIVATE_KEY", "priv")
    assert (await client.get("/api/v1/notifications/push/config", headers=h)).json() == {
        "enabled": True,
        "vapid_key": "pub",
    }
    assert (
        await client.post(
            "/api/v1/notifications/push/subscriptions",
            json={"endpoint": "https://short"},
            headers=h,
        )
    ).status_code == 422
    assert (
        await client.post(
            "/api/v1/notifications/push/subscriptions", json={"endpoint": TOKEN}, headers=h
        )
    ).status_code == 422
    assert (
        await client.post(
            "/api/v1/notifications/push/subscriptions",
            json={"endpoint": TOKEN, "keys": KEYS},
            headers=h,
        )
    ).status_code == 204
    assert (
        await client.post(
            "/api/v1/notifications/push/subscriptions",
            json={"endpoint": TOKEN, "keys": KEYS},
            headers=h,
        )
    ).status_code == 204
    async with TestingSessionLocal() as db:
        rows = (await db.execute(select(PushSubscription))).scalars().all()
        assert len(rows) == 1
        assert rows[0].revoked_at is None
        assert rows[0].p256dh == UA_PUB and rows[0].auth_secret == AUTH
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
        db.add(_sub(u.id))
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
    monkeypatch.setattr(settings, "WEB_PUSH_VAPID_PUBLIC_KEY", "")
    async with TestingSessionLocal() as db:
        db.add(_sub(u.id))
        await db.commit()
        await notify_user(db, u.id, "Offer", "b", "contract_offer", email_event_key="n1")
        await db.commit()
        assert (
            await db.execute(select(OutboxEvent).where(OutboxEvent.event_type == "push.notify"))
        ).scalars().all() == []


@pytest.mark.asyncio
async def test_send_push_encrypts_signs_delivers_and_revokes(fcm):
    u = await _user("push-send@example.com")
    dead = "https://updates.push.services.mozilla.com/wpush/v2/dead-" + "y" * 30
    async with TestingSessionLocal() as db:
        db.add(_sub(u.id))
        db.add(_sub(u.id, dead))
        db.add(PushSubscription(user_id=u.id, token="legacy-fcm-token-" + "z" * 30))
        await db.commit()
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        scheme, _, rest = request.headers["authorization"].partition(" ")
        assert scheme == "vapid"
        parts = dict(p.strip().split("=", 1) for p in rest.split(","))
        assert parts["k"] == fcm
        pub = ec.EllipticCurvePublicKey.from_encoded_point(
            ec.SECP256R1(), push_mod.b64u_decode(parts["k"])
        )
        claims = jwt.decode(
            parts["t"], pub, algorithms=["ES256"], audience=f"https://{request.url.host}"
        )
        assert claims["sub"].startswith("mailto:")
        assert request.headers["content-encoding"] == "aes128gcm"
        assert request.headers["ttl"] == "86400"
        import json as _json

        seen.append(_json.loads(decrypt(request.content)))
        if "dead-" in str(request.url):
            return httpx.Response(410)
        return httpx.Response(201)

    async with (
        httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http,
        TestingSessionLocal() as db,
    ):
        result = await push_mod.send_push(
            db, u.id, "Offer", "You have an offer", "#contracts", http=http
        )
    assert result == {"sent": 1, "skipped": 0, "revoked": 2}
    assert {m["title"] for m in seen} == {"Offer"}
    assert seen[0]["url"].endswith("/#contracts")
    async with TestingSessionLocal() as db:
        rows = {
            s.token: s.revoked_at
            for s in (await db.execute(select(PushSubscription))).scalars().all()
        }
        assert rows[TOKEN] is None
        assert rows[dead] is not None


@pytest.mark.asyncio
async def test_send_push_retries_when_every_endpoint_fails(fcm):
    u = await _user("push-fail@example.com")
    async with TestingSessionLocal() as db:
        db.add(_sub(u.id))
        await db.commit()
    async with (
        httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(503))) as http,
        TestingSessionLocal() as db,
    ):
        with pytest.raises(httpx.HTTPStatusError):
            await push_mod.send_push(db, u.id, "t", "b", "#x", http=http)


def test_pem_private_key_and_payload_limit(monkeypatch):
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    monkeypatch.setattr(settings, "WEB_PUSH_VAPID_PRIVATE_KEY", pem)
    monkeypatch.setattr(settings, "WEB_PUSH_VAPID_PUBLIC_KEY", "pub")
    assert push_mod.vapid_header("https://push.example.com/x").startswith("vapid t=")
    with pytest.raises(ValueError):
        push_mod.encrypt(b"x" * 5000, UA_PUB, AUTH)
