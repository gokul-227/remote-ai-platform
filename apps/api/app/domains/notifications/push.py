"""
Browser push through Firebase Cloud Messaging (HTTP v1).

Flow: `notify_user` -> `queue_push` adds an outbox event inside the caller's
transaction -> the worker's `notifications.send_push` task loads the user's
active device tokens and calls FCM. Tokens FCM reports as unregistered are
revoked. Nothing is sent while FCM is not configured, and each user is capped at
`PUSH_MAX_PER_USER_PER_HOUR` pushes.

Auth uses the service-account key directly (an RS256 JWT exchanged for an
OAuth token), so no Google SDK is required.
"""

import base64
import json
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.domains.notifications.models import PushSubscription
from app.domains.tasks.models import TaskRun

logger = get_logger(__name__)

TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
TASK_SEND_PUSH = "notifications.send_push"
_cached: dict[str, Any] = {"token": None, "expires": 0.0}


def push_enabled() -> bool:
    return bool(settings.FCM_PROJECT_ID and settings.FCM_CREDENTIALS_B64)


def _service_account() -> dict[str, str]:
    return json.loads(base64.b64decode(settings.FCM_CREDENTIALS_B64))


async def _access_token(client: httpx.AsyncClient) -> str:
    if _cached["token"] and _cached["expires"] > time.time() + 60:
        return str(_cached["token"])
    sa = _service_account()
    now = int(time.time())
    assertion = jwt.encode(
        {
            "iss": sa["client_email"],
            "scope": SCOPE,
            "aud": TOKEN_URL,
            "iat": now,
            "exp": now + 3600,
        },
        sa["private_key"],
        algorithm="RS256",
    )
    res = await client.post(
        TOKEN_URL,
        data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion},
        timeout=10,
    )
    res.raise_for_status()
    body = res.json()
    _cached["token"] = body["access_token"]
    _cached["expires"] = time.time() + int(body.get("expires_in", 3600))
    return str(body["access_token"])


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
    """Deliver one notification to every active device of the user. Commits."""
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
    sent = revoked = 0
    owns_client = http is None
    client = http or httpx.AsyncClient()
    try:
        token = await _access_token(client)
        url = f"https://fcm.googleapis.com/v1/projects/{settings.FCM_PROJECT_ID}/messages:send"
        for sub in subs:
            message = {
                "message": {
                    "token": sub.token,
                    "notification": {"title": title, "body": body},
                    "webpush": {"fcm_options": {"link": f"{settings.APP_URL.rstrip('/')}/{link}"}},
                    "data": {"link": link},
                }
            }
            res = await client.post(
                url, json=message, headers={"Authorization": f"Bearer {token}"}, timeout=10
            )
            if res.status_code == 200:
                sent += 1
                sub.last_seen_at = datetime.now(UTC)
            elif res.status_code == 404 or (res.status_code == 400 and "UNREGISTERED" in res.text):
                sub.revoked_at = datetime.now(UTC)
                revoked += 1
            else:
                logger.warning("Push delivery failed", status=res.status_code)
                res.raise_for_status()  # let the task retry transient failures
    finally:
        if owns_client:
            await client.aclose()
        await db.commit()
    return {"sent": sent, "skipped": 0, "revoked": revoked}
