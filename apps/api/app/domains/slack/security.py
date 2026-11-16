"""
Slack request signatures and signed confirmation tokens.

Slack signs every request: v0=HMAC-SHA256(signing secret, "v0:{timestamp}:{raw body}").
Requests older (or newer) than five minutes are refused to stop replays.

Confirmation buttons for destructive or monetary commands carry a token signed
with the same secret: the command text, the Slack user who asked, and an expiry.
Only that user can confirm it, and only before it expires.
"""

import base64
import hashlib
import hmac
import json
import time
from typing import Any

from app.core.config import settings

MAX_AGE_SECONDS = 300


def verify(
    body: bytes, timestamp: str | None, signature: str | None, now: float | None = None
) -> bool:
    secret = settings.SLACK_SIGNING_SECRET
    if not secret or not timestamp or not signature:
        return False
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    if abs((now if now is not None else time.time()) - ts) > MAX_AGE_SECONDS:
        return False
    base = b"v0:" + timestamp.encode() + b":" + body
    expected = "v0=" + hmac.new(secret.encode(), base, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def sign(base: bytes) -> str:
    """Helper for tests and tools: the X-Slack-Signature for a timestamp+body base."""
    return (
        "v0=" + hmac.new(settings.SLACK_SIGNING_SECRET.encode(), base, hashlib.sha256).hexdigest()
    )


def _mac(data: bytes) -> str:
    key = b"rap-confirm:" + settings.SLACK_SIGNING_SECRET.encode()
    return hmac.new(key, data, hashlib.sha256).hexdigest()[:32]


def confirm_token(slack_user_id: str, text: str, now: float | None = None) -> str:
    exp = int((now if now is not None else time.time()) + settings.SLACK_CONFIRM_MINUTES * 60)
    data = json.dumps({"u": slack_user_id, "t": text, "e": exp}, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(data).decode() + "." + _mac(data)


def read_confirm_token(token: str, slack_user_id: str, now: float | None = None) -> str | None:
    """The confirmed command text, or None when forged, expired or someone else's."""
    try:
        encoded, mac = token.rsplit(".", 1)
        data = base64.urlsafe_b64decode(encoded.encode())
        if not hmac.compare_digest(_mac(data), mac):
            return None
        body: dict[str, Any] = json.loads(data)
    except (ValueError, json.JSONDecodeError):
        return None
    if body.get("u") != slack_user_id:
        return None
    if int(body.get("e", 0)) < (now if now is not None else time.time()):
        return None
    text = body.get("t")
    return text if isinstance(text, str) else None
