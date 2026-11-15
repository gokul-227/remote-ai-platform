"""
Browser push through the standard Web Push protocol (no Firebase, no account).

Flow: `notify_user` -> `queue_push` adds an outbox event inside the caller's
transaction -> the worker's `notifications.send_push` task loads the user's
active subscriptions and POSTs an encrypted message to each push endpoint.
Endpoints answering 404/410 are revoked. Nothing is sent while the VAPID keys
are not configured, and each user is capped at `PUSH_MAX_PER_USER_PER_HOUR`.

    RFC 8030  Web Push (POST to the subscription endpoint, TTL/Urgency headers)
    RFC 8291  message encryption (ECDH P-256 + HKDF-SHA256, aes128gcm content coding)
    RFC 8292  VAPID (ES256 JWT, `Authorization: vapid t=<jwt>, k=<public key>`)

`push_subscriptions.token` holds the endpoint URL; `p256dh` / `auth_secret`
hold the browser's keys (migration 071). Rows without keys (old FCM tokens)
are revoked on the first delivery attempt.
"""

import base64
import json
import os
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlsplit

import httpx
import jwt
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.domains.notifications.models import PushSubscription
from app.domains.tasks.models import TaskRun

logger = get_logger(__name__)

TASK_SEND_PUSH = "notifications.send_push"
RECORD_SIZE = 4096


def b64u_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def push_enabled() -> bool:
    return bool(settings.WEB_PUSH_VAPID_PUBLIC_KEY and settings.WEB_PUSH_VAPID_PRIVATE_KEY)


def _vapid_private_key() -> ec.EllipticCurvePrivateKey:
    raw = settings.WEB_PUSH_VAPID_PRIVATE_KEY.strip()
    if raw.startswith("-----BEGIN"):
        key = serialization.load_pem_private_key(raw.encode(), password=None)
        assert isinstance(key, ec.EllipticCurvePrivateKey)
        return key
    return ec.derive_private_key(int.from_bytes(b64u_decode(raw), "big"), ec.SECP256R1())


def generate_vapid_keys() -> tuple[str, str]:
    """(public, private) as base64url: uncompressed point and raw 32-byte scalar."""
    key = ec.generate_private_key(ec.SECP256R1())
    public = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return b64u(public), b64u(key.private_numbers().private_value.to_bytes(32, "big"))


def vapid_header(endpoint: str, now: int | None = None) -> str:
    parts = urlsplit(endpoint)
    claims = {
        "aud": f"{parts.scheme}://{parts.netloc}",
        "exp": (now or int(time.time())) + 12 * 3600,
        "sub": settings.WEB_PUSH_SUBJECT,
    }
    token = jwt.encode(claims, _vapid_private_key(), algorithm="ES256")  # type: ignore[arg-type]
    return f"vapid t={token}, k={settings.WEB_PUSH_VAPID_PUBLIC_KEY}"


def _hkdf(salt: bytes, ikm: bytes, info: bytes, length: int) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=info).derive(ikm)


def encrypt(
    plaintext: bytes,
    p256dh: str,
    auth: str,
    *,
    salt: bytes | None = None,
    sender_key: ec.EllipticCurvePrivateKey | None = None,
) -> bytes:
    """RFC 8291 aes128gcm body (header + one record)."""
    ua_public = b64u_decode(p256dh)
    auth_secret = b64u_decode(auth)
    salt = salt or os.urandom(16)
    as_key = sender_key or ec.generate_private_key(ec.SECP256R1())
    as_public = as_key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    ua_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public)
    shared = as_key.exchange(ec.ECDH(), ua_key)
    ikm = _hkdf(auth_secret, shared, b"WebPush: info\x00" + ua_public + as_public, 32)
    cek = _hkdf(salt, ikm, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _hkdf(salt, ikm, b"Content-Encoding: nonce\x00", 12)
    if len(plaintext) > RECORD_SIZE - 17:
        raise ValueError("push payload too large")
    record = AESGCM(cek).encrypt(nonce, plaintext + b"\x02", None)
    header = salt + RECORD_SIZE.to_bytes(4, "big") + bytes([len(as_public)]) + as_public
    return header + record


async def queue_push(
    db: AsyncSession, user_id: uuid.UUID, title: str, body: str, link: str | None, dedup_key: str
) -> None:
    """Record a push intent in the caller's transaction (dispatched by the worker)."""
    if not push_enabled():
        return
    has_device = await db.scalar(
        select(PushSubscription.id)
        .where(PushSubscription.user_id == user_id, PushSubscription.revoked_at.is_(None))
        .limit(1)
    )
    if has_device is None:
        return
    from app.domains.tasks.service import TaskService

    await TaskService(db).emit(
        "push.notify",
        "user",
        str(user_id),
        {
            "title": title[:120],
            "body": body[:240],
            "link": link or "#notifications",
            "dedup": dedup_key[:120],
        },
    )


async def send_push(
    db: AsyncSession,
    user_id: uuid.UUID,
    title: str,
    body: str,
    link: str,
    *,
    http: httpx.AsyncClient | None = None,
) -> dict[str, int]:
    """Deliver one notification to every active subscription of the user. Commits."""
    if not push_enabled():
        return {"sent": 0, "skipped": 1, "revoked": 0}
    hour_ago = datetime.now(UTC) - timedelta(hours=1)
    recent = await db.scalar(
        select(func.count())
        .select_from(TaskRun)
        .where(
            TaskRun.task_name == TASK_SEND_PUSH,
            TaskRun.created_at >= hour_ago,
            TaskRun.args["aggregate_id"].as_string() == str(user_id),
        )
    )
    if (recent or 0) > settings.PUSH_MAX_PER_USER_PER_HOUR:
        return {"sent": 0, "skipped": 1, "revoked": 0}
    subs = (
        (
            await db.execute(
                select(PushSubscription).where(
                    PushSubscription.user_id == user_id, PushSubscription.revoked_at.is_(None)
                )
            )
        )
        .scalars()
        .all()
    )
    payload: dict[str, Any] = {
        "title": title,
        "body": body,
        "link": link,
        "url": f"{settings.APP_URL.rstrip('/')}/{link}",
    }
    message = json.dumps(payload, separators=(",", ":")).encode()
    sent = revoked = 0
    failure: httpx.Response | None = None
    owns_client = http is None
    client = http or httpx.AsyncClient()
    try:
        for sub in subs:
            if not (sub.p256dh and sub.auth_secret and sub.token.startswith("https://")):
                sub.revoked_at = datetime.now(UTC)  # legacy FCM registration token
                revoked += 1
                continue
            res = await client.post(
                sub.token,
                content=encrypt(message, sub.p256dh, sub.auth_secret),
                headers={
                    "Authorization": vapid_header(sub.token),
                    "Content-Encoding": "aes128gcm",
                    "Content-Type": "application/octet-stream",
                    "TTL": "86400",
                    "Urgency": "normal",
                },
                timeout=10,
            )
            if res.status_code in (200, 201, 202):
                sent += 1
                sub.last_seen_at = datetime.now(UTC)
            elif res.status_code in (404, 410):
                sub.revoked_at = datetime.now(UTC)
                revoked += 1
            else:
                logger.warning("Push delivery failed", status=res.status_code)
                failure = res
    finally:
        if owns_client:
            await client.aclose()
        await db.commit()
    if failure is not None and sent == 0:
        failure.raise_for_status()  # let the task retry transient failures
    return {"sent": sent, "skipped": 0, "revoked": revoked}
