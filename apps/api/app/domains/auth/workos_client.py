"""WorkOS User Management API: the calls this app needs.

Server-side only (WORKOS_API_KEY never reaches the browser). Used to send and
verify email sign-in codes (Magic Auth), exchange OAuth authorization codes,
refresh sessions, revoke sessions on sign-out, read a user's verified email on
first sign-in, and erase the WorkOS user when its owner deletes their account.

Tokens returned here are WorkOS's own; this app still never mints tokens.
"""

import re
from typing import Any
from urllib.parse import urlencode

import httpx

from app.core.config import settings

# Sign-in options shown in the app, mapped to WorkOS AuthKit provider names.
OAUTH_PROVIDERS = {
    "google": "GoogleOAuth",
    "github": "GitHubOAuth",
    "microsoft": "MicrosoftOAuth",
}

_ID = re.compile(r"^[A-Za-z0-9_]{1,64}$")
TIMEOUT = 10
# Tests swap in an httpx.MockTransport; None means the real network.
transport: httpx.AsyncBaseTransport | None = None


class WorkOSError(Exception):
    """A WorkOS call failed. `status` is WorkOS's HTTP status, `code` its error code."""

    def __init__(self, status: int, code: str = "") -> None:
        super().__init__(f"WorkOS error {status} {code}".strip())
        self.status = status
        self.code = code


def is_configured() -> bool:
    return bool(settings.WORKOS_CLIENT_ID and settings.WORKOS_API_KEY)


def _url(path: str) -> str:
    return f"{settings.WORKOS_API_URL.rstrip('/')}{path}"


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.WORKOS_API_KEY}"}


def _safe_id(value: str) -> str:
    # WorkOS ids are prefixed base32 (user_01..., session_01...); never interpolate anything else.
    if not _ID.match(value):
        raise ValueError("invalid WorkOS id")
    return value


async def _request(method: str, path: str, **kwargs: Any) -> httpx.Response:
    async with httpx.AsyncClient(timeout=TIMEOUT, transport=transport) as client:
        return await client.request(method, _url(path), **kwargs)


def _raise_for(resp: httpx.Response) -> None:
    if resp.status_code < 400:
        return
    code = ""
    try:
        body = resp.json()
        code = str(body.get("code") or body.get("error") or "")[:64]
    except ValueError:
        pass
    raise WorkOSError(resp.status_code, code)


def _tokens(body: dict[str, Any]) -> dict[str, Any]:
    """Only what the browser needs; WorkOS's user object stays server-side."""
    return {
        "access_token": body["access_token"],
        "refresh_token": body.get("refresh_token"),
        "token_type": "bearer",
    }


async def send_magic_auth_code(email: str) -> None:
    """WorkOS emails a one-time code. The code in the response is never returned."""
    resp = await _request(
        "POST", "/user_management/magic_auth", headers=_headers(), json={"email": email}
    )
    _raise_for(resp)


async def _authenticate(payload: dict[str, Any]) -> dict[str, Any]:
    body = {
        "client_id": settings.WORKOS_CLIENT_ID,
        "client_secret": settings.WORKOS_API_KEY,
        **payload,
    }
    resp = await _request("POST", "/user_management/authenticate", json=body)
    _raise_for(resp)
    return _tokens(resp.json())


async def verify_magic_auth_code(email: str, code: str) -> dict[str, Any]:
    return await _authenticate(
        {"grant_type": "urn:workos:oauth:grant-type:magic-auth:code", "email": email, "code": code}
    )


async def exchange_code(code: str, code_verifier: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"grant_type": "authorization_code", "code": code}
    if code_verifier:
        payload["code_verifier"] = code_verifier
    return await _authenticate(payload)


async def refresh(refresh_token: str) -> dict[str, Any]:
    return await _authenticate({"grant_type": "refresh_token", "refresh_token": refresh_token})


def authorization_url(
    provider: str, redirect_uri: str, state: str, code_challenge: str | None = None
) -> str:
    params = {
        "client_id": settings.WORKOS_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "provider": OAUTH_PROVIDERS[provider],
        "state": state,
    }
    if code_challenge:
        params["code_challenge"] = code_challenge
        params["code_challenge_method"] = "S256"
    base = (settings.WORKOS_AUTHORIZE_URL or settings.WORKOS_API_URL).rstrip("/")
    return f"{base}/user_management/authorize?{urlencode(params)}"


async def get_user(user_id: str) -> dict[str, Any]:
    resp = await _request("GET", f"/user_management/users/{_safe_id(user_id)}", headers=_headers())
    _raise_for(resp)
    data: dict[str, Any] = resp.json()
    return data


async def revoke_session(session_id: str) -> None:
    resp = await _request(
        "POST",
        "/user_management/sessions/revoke",
        headers=_headers(),
        json={"session_id": _safe_id(session_id)},
    )
    if resp.status_code != 404:
        _raise_for(resp)


async def revoke_all_sessions(user_id: str) -> int:
    resp = await _request(
        "GET",
        f"/user_management/users/{_safe_id(user_id)}/sessions",
        headers=_headers(),
        params={"limit": 100},
    )
    _raise_for(resp)
    revoked = 0
    for session in resp.json().get("data", []):
        if session.get("status", "active") == "active":
            await revoke_session(str(session["id"]))
            revoked += 1
    return revoked


async def delete_identity(subject: str) -> bool:
    """Delete the WorkOS user (sessions and OAuth links go with it). True if deleted or gone."""
    resp = await _request(
        "DELETE", f"/user_management/users/{_safe_id(subject)}", headers=_headers()
    )
    if resp.status_code == 404:
        return True
    _raise_for(resp)
    return True
