"""
Owner notifications in Slack (bot token + chat.postMessage).

    await post("critical", "Worker heartbeat stale", dedup_key="hb:worker")   # worker code
    notify("security", "Staff role changed ...")                                # request paths

Channels are logical names mapped to channel ids from settings (`CHANNELS`).
Nothing here ever raises: a missing token or channel, a Slack outage, a rate
limit or a duplicate inside the dedup window all just return False. `notify`
schedules the post on the running loop so a request never waits for Slack.

Rate limit and dedup are per process (in memory): several processes may each
post the same alert once, which is acceptable for owner notifications.
"""

import asyncio
import time
from collections import deque
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

POST_URL = "https://slack.com/api/chat.postMessage"

CHANNELS: dict[str, str] = {
    "critical": "SLACK_CHANNEL_ALERTS_CRITICAL",
    "errors": "SLACK_CHANNEL_ALERTS_ERRORS",
    "deploys": "SLACK_CHANNEL_DEPLOYS",
    "backups": "SLACK_CHANNEL_BACKUPS",
    "job_imports": "SLACK_CHANNEL_JOB_IMPORTS",
    "signups": "SLACK_CHANNEL_SIGNUPS",
    "security": "SLACK_CHANNEL_SECURITY",
    "costs": "SLACK_CHANNEL_COSTS",
}

_seen: dict[str, float] = {}
_sent: dict[str, deque[float]] = {}
_pending: set[asyncio.Task[bool]] = set()
_transport: httpx.AsyncBaseTransport | None = None  # tests inject httpx.MockTransport


def enabled() -> bool:
    return bool(settings.SLACK_BOT_TOKEN)


def channel_id(channel: str) -> str:
    attr = CHANNELS.get(channel)
    return str(getattr(settings, attr, "") or "") if attr else ""


def reset() -> None:
    """Forget dedup/rate state (tests)."""
    _seen.clear()
    _sent.clear()


def _admit(channel: str, dedup_key: str | None) -> bool:
    now = time.monotonic()
    if dedup_key:
        key = f"{channel}:{dedup_key}"
        expires = _seen.get(key)
        if expires is not None and expires > now:
            return False
        if len(_seen) > 5000:
            for k in [k for k, v in _seen.items() if v <= now]:
                _seen.pop(k, None)
        _seen[key] = now + settings.SLACK_DEDUP_SECONDS
    window = _sent.setdefault(channel, deque())
    while window and window[0] <= now - 60:
        window.popleft()
    if len(window) >= settings.SLACK_MAX_PER_MINUTE:
        return False
    window.append(now)
    return True


def _prefix(text: str) -> str:
    env = settings.APP_ENV
    return text if env == "production" else f"[{env}] {text}"


async def post(
    channel: str,
    text: str,
    *,
    dedup_key: str | None = None,
    fields: dict[str, Any] | None = None,
) -> bool:
    """Post one message. Returns True when Slack accepted it. Never raises."""
    try:
        target = channel_id(channel)
        if not enabled() or not target:
            return False
        if not _admit(channel, dedup_key):
            return False
        body = _prefix(text)[:3000]
        if fields:
            body += "\n" + "\n".join(f"• *{k}*: {v}" for k, v in fields.items() if v is not None)
        async with httpx.AsyncClient(
            transport=_transport, timeout=settings.SLACK_TIMEOUT_SECONDS
        ) as client:
            res = await client.post(
                POST_URL,
                json={"channel": target, "text": body[:3900], "unfurl_links": False},
                headers={"Authorization": f"Bearer {settings.SLACK_BOT_TOKEN}"},
            )
        ok = res.status_code == 200 and bool(res.json().get("ok"))
        if not ok:
            logger.warning("Slack post rejected", channel=channel, status=res.status_code)
        return ok
    except Exception as exc:  # never into the caller
        logger.warning("Slack post failed", channel=channel, error=type(exc).__name__)
        return False


def notify(
    channel: str,
    text: str,
    *,
    dedup_key: str | None = None,
    fields: dict[str, Any] | None = None,
) -> None:
    """Fire-and-forget `post` on the running loop (request paths). Never raises."""
    if not enabled() or not channel_id(channel):
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    task = loop.create_task(post(channel, text, dedup_key=dedup_key, fields=fields))
    _pending.add(task)
    task.add_done_callback(_pending.discard)


async def drain() -> None:
    """Wait for scheduled posts (tests, worker shutdown)."""
    if _pending:
        await asyncio.gather(*list(_pending), return_exceptions=True)


# ── audit-event routing ────────────────────────────────────────────────────

AUDIT_ROUTES: dict[str, tuple[str, str]] = {
    "admin.user.role": ("security", "Member role changed"),
    "staff.roles.update": ("security", "Staff roles changed"),
    "admin.bootstrap": ("security", "Staff account bootstrapped"),
    "admin.user.status": ("security", "Account status changed by staff"),
    "admin.user.revoke_sessions": ("security", "Sessions revoked by staff"),
    "feature_flag.update": ("security", "Feature flag changed"),
    "background.dead_letter.retry": ("critical", "Dead letter retried by staff"),
}

_SAFE_KEYS = (
    "reason",
    "role",
    "roles",
    "before",
    "after",
    "key",
    "enabled",
    "status",
    "severity",
    "override",
)


def audit_hook(
    action: str,
    resource_type: str,
    resource_id: str | None,
    actor_id: Any,
    payload: dict[str, Any],
) -> None:
    """Called by record_audit_event for every audit row; routes the ones that matter."""
    try:
        if action.startswith("admin.incident."):
            _incident(action, resource_id, payload)
            return
        route = AUDIT_ROUTES.get(action)
        if route is None:
            return
        channel, title = route
        fields: dict[str, Any] = {"action": action, f"{resource_type}": resource_id}
        fields["by"] = str(actor_id) if actor_id else "system"
        for k in _SAFE_KEYS:
            if k in payload:
                fields[k] = str(payload[k])[:300]
        notify(channel, f":closed_lock_with_key: {title}", fields=fields)
    except Exception:
        logger.warning("Slack audit hook failed", action=action)


def _incident(action: str, resource_id: str | None, payload: dict[str, Any]) -> None:
    after = payload.get("after") or {}
    link = f"{settings.ADMIN_URL.rstrip('/')}/#incidents" if settings.ADMIN_URL else None
    if action == "admin.incident.create":
        notify(
            "critical",
            f":rotating_light: Incident opened ({payload.get('severity', '?')})",
            fields={"id": resource_id, "reason": payload.get("reason"), "console": link},
        )
    elif isinstance(after, dict) and after.get("status") in {"RESOLVED"}:
        notify(
            "critical",
            f":white_check_mark: Incident {str(after['status']).lower()}",
            fields={"id": resource_id, "reason": payload.get("reason"), "console": link},
        )
