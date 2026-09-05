"""Direct OAuth2 login for Google and Microsoft -- no identity-broker service.

Each provider is consumed directly (authorization code exchange against the
provider's own token endpoint, then a userinfo fetch) rather than through
Keycloak or any other broker: this app is a *client* of Google/Microsoft's
OAuth, not an OAuth *provider* itself, so a broker adds a service and a
failure point without removing any of this code.
"""

import secrets
import time
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status

from app.core.config import settings

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

MICROSOFT_AUTH_URL_TMPL = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize"
MICROSOFT_TOKEN_URL_TMPL = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
MICROSOFT_USERINFO_URL = "https://graph.microsoft.com/oidc/userinfo"

# CSRF state tokens: short-lived, single-process, in-memory is correct here
# (WEB_CONCURRENCY=1 on this deployment; a login flow completes in seconds).
_PENDING_STATES: dict[str, float] = {}
_STATE_TTL_SECONDS = 600

# One-time handoff codes so the OAuth callback (a browser GET redirect, where
# putting real access/refresh tokens in the URL would leak them into browser
# history and server logs) can hand the frontend a short opaque code instead;
# the frontend immediately exchanges it for the real tokens via POST.
_HANDOFF_CODES: dict[str, tuple[str, str, float]] = {}
_HANDOFF_TTL_SECONDS = 60


@dataclass(frozen=True)
class OAuthUserInfo:
    email: str
    full_name: str
    avatar_url: str | None


def _prune_expired(store: dict, ttl_key_index: int | None = None) -> None:
    now = time.time()
    if ttl_key_index is None:
        expired = [k for k, exp in store.items() if exp < now]
    else:
        expired = [k for k, v in store.items() if v[ttl_key_index] < now]
    for k in expired:
        del store[k]


def create_state() -> str:
    _prune_expired(_PENDING_STATES)
    state = secrets.token_urlsafe(24)
    _PENDING_STATES[state] = time.time() + _STATE_TTL_SECONDS
    return state


def consume_state(state: str) -> None:
    _prune_expired(_PENDING_STATES)
    if state not in _PENDING_STATES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired OAuth state"
        )
    del _PENDING_STATES[state]


def create_handoff(access_token: str, refresh_token: str) -> str:
    _prune_expired(_HANDOFF_CODES, ttl_key_index=2)
    code = secrets.token_urlsafe(32)
    _HANDOFF_CODES[code] = (access_token, refresh_token, time.time() + _HANDOFF_TTL_SECONDS)
    return code


def consume_handoff(code: str) -> tuple[str, str]:
    _prune_expired(_HANDOFF_CODES, ttl_key_index=2)
    entry = _HANDOFF_CODES.pop(code, None)
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired handoff code"
        )
    access_token, refresh_token, _ = entry
    return access_token, refresh_token


def _api_base_url() -> str:
    # Render sets this automatically to the service's own public URL.
    import os

    return os.environ.get("RENDER_EXTERNAL_URL") or "http://localhost:8000"


def _redirect_uri(provider: str) -> str:
    # Points back at this API, not the frontend -- the callback below issues
    # this app's own JWTs, then redirects the *browser* to the frontend.
    return f"{_api_base_url()}/api/v1/auth/oauth/{provider}/callback"


def get_authorization_url(provider: str) -> str:
    state = create_state()
    if provider == "google":
        if not settings.GOOGLE_OAUTH_CLIENT_ID:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google login is not configured")
        params = {
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "redirect_uri": _redirect_uri("google"),
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "online",
            "prompt": "select_account",
        }
        return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    if provider == "microsoft":
        if not settings.MICROSOFT_OAUTH_CLIENT_ID:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Microsoft login is not configured")
        params = {
            "client_id": settings.MICROSOFT_OAUTH_CLIENT_ID,
            "redirect_uri": _redirect_uri("microsoft"),
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
        auth_url = MICROSOFT_AUTH_URL_TMPL.format(tenant=settings.MICROSOFT_OAUTH_TENANT)
        return f"{auth_url}?{urlencode(params)}"
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown OAuth provider")


async def exchange_code_for_userinfo(provider: str, code: str) -> OAuthUserInfo:
    async with httpx.AsyncClient(timeout=10.0) as client:
        if provider == "google":
            token_resp = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
                    "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
                    "code": code,
                    "redirect_uri": _redirect_uri("google"),
                    "grant_type": "authorization_code",
                },
            )
            if token_resp.status_code != 200:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google authorization failed")
            access_token = token_resp.json()["access_token"]
            info_resp = await client.get(
                GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}
            )
            info_resp.raise_for_status()
            info = info_resp.json()
            # Google's userinfo response carries its own verification flag --
            # without this check, an unverified email claim could get
            # auto-linked (in the router) to a pre-existing password account
            # of the same address, logging the caller into someone else's
            # account with no password challenge.
            if not info.get("email_verified", False):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Google account email is not verified",
                )
            return OAuthUserInfo(
                email=info["email"],
                full_name=info.get("name") or info["email"].split("@")[0],
                avatar_url=info.get("picture"),
            )

        if provider == "microsoft":
            token_url = MICROSOFT_TOKEN_URL_TMPL.format(tenant=settings.MICROSOFT_OAUTH_TENANT)
            token_resp = await client.post(
                token_url,
                data={
                    "client_id": settings.MICROSOFT_OAUTH_CLIENT_ID,
                    "client_secret": settings.MICROSOFT_OAUTH_CLIENT_SECRET,
                    "code": code,
                    "redirect_uri": _redirect_uri("microsoft"),
                    "grant_type": "authorization_code",
                },
            )
            if token_resp.status_code != 200:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Microsoft authorization failed")
            access_token = token_resp.json()["access_token"]
            info_resp = await client.get(
                MICROSOFT_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}
            )
            info_resp.raise_for_status()
            info = info_resp.json()
            email = info.get("email") or info.get("preferred_username")
            if not email:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Microsoft account has no email")
            return OAuthUserInfo(
                email=email,
                full_name=info.get("name") or email.split("@")[0],
                avatar_url=None,  # Graph userinfo doesn't include a photo URL directly
            )

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown OAuth provider")
