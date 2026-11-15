"""Opt-in "Find people you know from Google" (feature flag `contacts_import`).

Privacy design:
- The member starts it; Google asks them to grant a read-only contacts scope
  (incremental consent, `access_type=online`, so no refresh token is issued).
- The authorization code is exchanged here, server-side, with PKCE. The
  verifier is never sent to the browser: it is an HMAC of a nonce carried in
  the signed `state`, which also binds the flow to the signed-in member.
- Only email addresses and display names are read, in memory. The access
  token is revoked and dropped right after the read; the contact list is
  never written anywhere.
- Matches are existing, active, non-staff members with a public profile who
  are not blocked either way. Everyone else (including members with hidden
  profiles) is returned exactly like a non-member, so the response never
  reveals whether an address has an account.
- Invitable contacts carry a short-lived signed token, so only addresses from
  this member's own Google read can be invited. Invites go only to addresses
  the member selected, at most CONTACT_INVITES_PER_DAY per 24 hours, never to
  suppressed addresses or existing accounts (silently skipped), and each
  email has a stop-invites link. A row keeps the plaintext address only until
  its send attempt finishes; then only the hash remains.
"""

import base64
import hashlib
import hmac
import html as html_lib
import secrets
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import APIRouter, Depends, Form, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.feature_flags import is_feature_enabled
from app.core.logging import get_logger
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User, UserRole
from app.domains.engineers.models import EngineerProfile
from app.domains.network.models import (
    Connection,
    ContactInvite,
    InviteSuppression,
    MemberInvite,
    UserBlock,
)
from app.services.email.service import get_email_provider

router = APIRouter(prefix="/contacts", tags=["Network"])
logger = get_logger("network.contacts")

SCOPES = (
    "https://www.googleapis.com/auth/contacts.other.readonly",
    "https://www.googleapis.com/auth/contacts.readonly",
)
GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105 - endpoint, not a secret
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
PEOPLE_URL = "https://people.googleapis.com/v1"
CALLBACK_PATH = "/contacts/callback"
STATE_TTL = 600
CONTACT_TOKEN_TTL = 3600
MAX_PAGES = 5  # per source, 1000 contacts a page
MAX_PER_REQUEST = 25
INVITE_TTL_DAYS = 30
TIMEOUT = 10
# Tests swap in an httpx.MockTransport; None means the real network.
transport: httpx.AsyncBaseTransport | None = None


# ── helpers ──────────────────────────────────────────────────────────────


def _key() -> bytes:
    raw = settings.INVITE_SIGNING_KEY or settings.GOOGLE_OAUTH_CLIENT_SECRET
    return hashlib.sha256(b"rap-contacts:" + raw.encode()).digest()


def _sign(msg: str) -> str:
    digest = hmac.new(_key(), msg.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def email_hash(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()


def _verifier(nonce: str) -> str:
    return _sign(f"pkce:{nonce}") + _sign(f"pkce2:{nonce}")[:11]  # 54 chars


def _challenge(verifier: str) -> str:
    return _b64(hashlib.sha256(verifier.encode()).digest())


def make_state(user_id: uuid.UUID, now: float | None = None) -> str:
    exp = int((now or time.time()) + STATE_TTL)
    nonce = secrets.token_urlsafe(16)
    body = f"{user_id.hex}.{exp}.{nonce}"
    return f"{body}.{_sign('state:' + body)}"


def check_state(state: str, user_id: uuid.UUID) -> str:
    """Returns the nonce for a valid, unexpired state of this member."""
    parts = state.split(".")
    if len(parts) != 4:
        raise _bad_state()
    uid, exp, nonce, sig = parts
    body = f"{uid}.{exp}.{nonce}"
    if not hmac.compare_digest(sig, _sign("state:" + body)):
        raise _bad_state()
    if uid != user_id.hex or not exp.isdigit() or int(exp) < time.time():
        raise _bad_state()
    return nonce


def _bad_state() -> HTTPException:
    return HTTPException(status_code=400, detail="This Google request expired. Start again.")


def contact_token(user_id: uuid.UUID, email: str, now: float | None = None) -> str:
    exp = int((now or time.time()) + CONTACT_TOKEN_TTL)
    return f"{exp}.{_sign(f'contact:{user_id.hex}:{email.lower()}:{exp}')}"


def check_contact_token(token: str, user_id: uuid.UUID, email: str) -> bool:
    exp, _, sig = token.partition(".")
    if not exp.isdigit() or int(exp) < time.time():
        return False
    return hmac.compare_digest(sig, _sign(f"contact:{user_id.hex}:{email.lower()}:{exp}"))


def stop_token(h: str) -> str:
    return _sign(f"stop:{h}")


def _require_enabled() -> None:
    if not is_feature_enabled("contacts_import") or not (
        settings.GOOGLE_OAUTH_CLIENT_ID and settings.GOOGLE_OAUTH_CLIENT_SECRET
    ):
        raise HTTPException(status_code=404, detail="Not found")


def _allowed_redirect(uri: str) -> bool:
    parsed = urlparse(uri)
    if parsed.query or parsed.fragment or parsed.path != CALLBACK_PATH:
        return False
    return f"{parsed.scheme}://{parsed.netloc}" in settings.CORS_ORIGINS


def _valid_email(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    email = value.strip().lower()
    if len(email) > 254 or email.count("@") != 1 or " " in email:
        return None
    local, domain = email.split("@")
    if not local or "." not in domain:
        return None
    return email


# ── Google calls ─────────────────────────────────────────────────────────


class GoogleError(Exception):
    pass


async def _exchange(client: httpx.AsyncClient, code: str, verifier: str, redirect_uri: str) -> str:
    resp = await client.post(
        GOOGLE_TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": verifier,
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
        },
    )
    if resp.status_code >= 400:
        raise GoogleError(f"token {resp.status_code}")
    token = resp.json().get("access_token")
    if not isinstance(token, str) or not token:
        raise GoogleError("no token")
    return token


async def _read_people(client: httpx.AsyncClient, token: str) -> dict[str, str]:
    """email -> display name, from saved contacts and "other contacts"."""
    headers = {"Authorization": f"Bearer {token}"}
    sources = (
        (f"{PEOPLE_URL}/otherContacts", {"readMask": "emailAddresses,names"}, "otherContacts"),
        (
            f"{PEOPLE_URL}/people/me/connections",
            {"personFields": "emailAddresses,names"},
            "connections",
        ),
    )
    found: dict[str, str] = {}
    granted = 0
    for url, params, key in sources:
        page_token: str | None = None
        for _ in range(MAX_PAGES):
            q: dict[str, Any] = {**params, "pageSize": 1000}
            if page_token:
                q["pageToken"] = page_token
            resp = await client.get(url, headers=headers, params=q)
            if resp.status_code == 403:
                break  # this scope was not granted (granular consent)
            if resp.status_code >= 400:
                raise GoogleError(f"people {resp.status_code}")
            granted += 1
            body = resp.json()
            for person in body.get(key) or []:
                names = person.get("names") or []
                name = str(names[0].get("displayName") or "")[:120] if names else ""
                for entry in person.get("emailAddresses") or []:
                    email = _valid_email(entry.get("value"))
                    if email and email not in found:
                        found[email] = name
            page_token = body.get("nextPageToken")
            if not page_token:
                break
    if not granted:
        raise GoogleError("no scope granted")
    return found


async def _revoke(client: httpx.AsyncClient, token: str) -> None:
    try:
        await client.post(GOOGLE_REVOKE_URL, data={"token": token})
    except httpx.HTTPError:
        pass  # the token is short-lived and online-only anyway


async def read_google_contacts(code: str, verifier: str, redirect_uri: str) -> dict[str, str]:
    async with httpx.AsyncClient(timeout=TIMEOUT, transport=transport) as client:
        token = await _exchange(client, code, verifier, redirect_uri)
        try:
            return await _read_people(client, token)
        finally:
            await _revoke(client, token)
            del token


# ── endpoints ────────────────────────────────────────────────────────────


class AuthorizeIn(BaseModel):
    redirect_uri: str = Field(max_length=512)


class ImportIn(BaseModel):
    code: str = Field(min_length=8, max_length=512)
    state: str = Field(min_length=16, max_length=256)
    redirect_uri: str = Field(max_length=512)


class ContactIn(BaseModel):
    email: str = Field(max_length=254)
    name: str | None = Field(default=None, max_length=120)
    token: str = Field(max_length=128)


class InviteIn(BaseModel):
    contacts: list[ContactIn] = Field(min_length=1, max_length=MAX_PER_REQUEST)


@router.get("/google/status", summary="Is the Google contacts finder available")
async def google_status(current_user: User = Depends(get_current_user)) -> dict[str, bool]:
    enabled = is_feature_enabled("contacts_import") and bool(
        settings.GOOGLE_OAUTH_CLIENT_ID and settings.GOOGLE_OAUTH_CLIENT_SECRET
    )
    return {"enabled": enabled}


@router.post("/google/authorize", summary="Start the Google contacts consent")
async def google_authorize(
    body: AuthorizeIn,
    current_user: User = Depends(get_current_user),
    _: None = Depends(_require_enabled),
) -> dict[str, str]:
    if not _allowed_redirect(body.redirect_uri):
        raise HTTPException(status_code=422, detail="redirect_uri is not allowed")
    state = make_state(current_user.id)
    nonce = state.split(".")[2]
    params = {
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri": body.redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "online",
        "include_granted_scopes": "true",
        "state": state,
        "code_challenge": _challenge(_verifier(nonce)),
        "code_challenge_method": "S256",
    }
    return {"url": f"{GOOGLE_AUTHORIZE_URL}?{urlencode(params)}"}


@router.post("/google/import", summary="Read Google contacts once and match them")
async def google_import(
    body: ImportIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_enabled),
) -> dict[str, Any]:
    nonce = check_state(body.state, current_user.id)
    if not _allowed_redirect(body.redirect_uri):
        raise HTTPException(status_code=422, detail="redirect_uri is not allowed")
    try:
        contacts = await read_google_contacts(body.code, _verifier(nonce), body.redirect_uri)
    except (GoogleError, httpx.HTTPError) as exc:
        logger.warning("Google contacts read failed", error=str(exc)[:40])
        raise HTTPException(
            status_code=400,
            detail="We couldn't read your Google contacts. Allow access to contacts and try again.",
        ) from exc
    me = current_user.id
    contacts.pop((current_user.email or "").lower(), None)
    matches = await _matches(db, me, list(contacts))
    matched_emails = {m.pop("_email") for m in matches}
    already = set(
        (
            await db.execute(select(ContactInvite.email_hash).where(ContactInvite.inviter_id == me))
        ).scalars()
    )
    invitable = [
        {
            "email": email,
            "name": name or None,
            "token": contact_token(me, email),
            "invited": email_hash(email) in already,
        }
        for email, name in sorted(contacts.items(), key=lambda kv: (kv[1] or kv[0]).lower())
        if email not in matched_emails
    ]
    return {
        "matches": matches,
        "invitable": invitable,
        "remaining_today": await _remaining(db, me),
    }


async def _matches(db: AsyncSession, me: uuid.UUID, emails: list[str]) -> list[dict[str, Any]]:
    if not emails:
        return []
    blocked: set[uuid.UUID] = set()
    for a, b in (
        await db.execute(
            select(UserBlock.blocker_id, UserBlock.blocked_id).where(
                or_(UserBlock.blocker_id == me, UserBlock.blocked_id == me)
            )
        )
    ).all():
        blocked |= {a, b}
    rows: list[Any] = []
    for i in range(0, len(emails), 500):
        rows += (
            await db.execute(
                select(
                    User.id,
                    User.email,
                    User.full_name,
                    User.avatar_url,
                    EngineerProfile.id,
                    EngineerProfile.headline,
                )
                .join(EngineerProfile, EngineerProfile.user_id == User.id)
                .where(
                    func.lower(User.email).in_(emails[i : i + 500]),
                    User.is_active.is_(True),
                    User.role != UserRole.ADMIN,
                    EngineerProfile.is_public.is_(True),
                    User.id != me,
                )
            )
        ).all()
    rows = [r for r in rows if r[0] not in blocked and not r[1].endswith(".invalid")]
    status_by: dict[uuid.UUID, str] = {}
    if rows:
        ids = [r[0] for r in rows]
        for s, r, st in (
            await db.execute(
                select(Connection.sender_id, Connection.receiver_id, Connection.status).where(
                    or_(
                        (Connection.sender_id == me) & Connection.receiver_id.in_(ids),
                        (Connection.receiver_id == me) & Connection.sender_id.in_(ids),
                    )
                )
            )
        ).all():
            status_by[r if s == me else s] = st
    return [
        {
            "_email": email.lower(),
            "id": uid,
            "full_name": name,
            "avatar_url": avatar,
            "engineer_profile_id": pid,
            "headline": headline,
            "connection_status": status_by.get(uid),
        }
        for uid, email, name, avatar, pid, headline in sorted(rows, key=lambda r: r[2] or "")
    ]


async def _sent_today(db: AsyncSession, me: uuid.UUID) -> int:
    since = datetime.now(UTC) - timedelta(days=1)
    return int(
        await db.scalar(
            select(func.count(ContactInvite.id)).where(
                ContactInvite.inviter_id == me, ContactInvite.created_at >= since
            )
        )
        or 0
    )


async def _remaining(db: AsyncSession, me: uuid.UUID) -> int:
    return max(settings.CONTACT_INVITES_PER_DAY - await _sent_today(db, me), 0)


def _invite_html(inviter: str, join_url: str, stop_url: str) -> str:
    who = html_lib.escape(inviter)
    return (
        '<div style="font-family:Inter,Arial,sans-serif;color:#1F2937;max-width:560px">'
        f'<h2 style="color:#102A43">{who} invited you to Remote AI Platform</h2>'
        f"<p>{who} uses Remote AI Platform for remote jobs and freelance work and would like "
        "to connect with you there. Joining is free.</p>"
        f'<p><a href="{html_lib.escape(join_url)}" style="display:inline-block;background:#175CD3;'
        'color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">'
        "Accept the invitation</a></p>"
        '<p style="font-size:12px;color:#65676b">You received this one-time invitation because '
        f"{who} chose to invite you. We did not store your address book entry. "
        f'<a href="{html_lib.escape(stop_url)}">Stop all invitations to this address</a>. '
        f"Questions? Write to {html_lib.escape(settings.SUPPORT_EMAIL)}.</p></div>"
    )


@router.post("/invites", summary="Email invitations to selected Google contacts")
async def send_contact_invites(
    body: InviteIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_enabled),
) -> dict[str, Any]:
    me = current_user.id
    picked: dict[str, str] = {}
    for c in body.contacts:
        email = _valid_email(c.email)
        if email is None or not check_contact_token(c.token, me, email):
            raise HTTPException(
                status_code=400,
                detail="Some contacts came from an expired list. Find your contacts again.",
            )
        picked[email] = email_hash(email)
    hashes = list(picked.values())
    existing = set(
        (
            await db.execute(
                select(ContactInvite.email_hash).where(
                    ContactInvite.inviter_id == me, ContactInvite.email_hash.in_(hashes)
                )
            )
        ).scalars()
    )
    new = {e: h for e, h in picked.items() if h not in existing}
    remaining = await _remaining(db, me)
    if len(new) > remaining:
        raise HTTPException(
            status_code=429,
            detail=f"You can send {settings.CONTACT_INVITES_PER_DAY} invitations a day. "
            f"{remaining} left today.",
        )
    if not new:
        return {"invited": 0, "remaining_today": remaining}
    suppressed = set(
        (
            await db.execute(
                select(InviteSuppression.email_hash).where(
                    InviteSuppression.email_hash.in_(list(new.values()))
                )
            )
        ).scalars()
    )
    members = {
        e.lower()
        for e in (
            await db.execute(select(User.email).where(func.lower(User.email).in_(list(new))))
        ).scalars()
    }
    rows: list[ContactInvite] = []
    for email, h in new.items():
        skip = h in suppressed or email in members
        row = ContactInvite(
            inviter_id=me,
            email_hash=h,
            email=None if skip else email,
            status="SKIPPED" if skip else "PENDING",
        )
        db.add(row)
        rows.append(row)
    token = secrets.token_urlsafe(24)
    db.add(
        MemberInvite(
            inviter_id=me,
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=datetime.now(UTC) + timedelta(days=INVITE_TTL_DAYS),
        )
    )
    await db.commit()

    site = (settings.FRONTEND_URL or settings.APP_URL).rstrip("/")
    api = settings.API_URL.rstrip("/")
    join_url = f"{site}/#network?invite={token}"
    provider = get_email_provider()
    for row in rows:
        if row.status != "PENDING" or not row.email:
            continue
        stop_url = f"{api}/api/v1/contacts/stop?{urlencode({'h': row.email_hash, 't': stop_token(row.email_hash)})}"
        try:
            result = await provider.send_email(
                row.email,
                f"{current_user.full_name} invited you to Remote AI Platform",
                _invite_html(current_user.full_name, join_url, stop_url),
                idempotency_key=f"contact-invite:{row.id}",
            )
            sent = result.sent
        except Exception as exc:  # noqa: BLE001 - one failure must not keep other addresses
            logger.warning("Contact invite send failed", error=type(exc).__name__)
            sent = False
        row.status = "SENT" if sent else "FAILED"
        row.sent_at = datetime.now(UTC) if sent else None
        row.email = None  # hash only from here on
    await db.commit()
    # Same answer whether an address was sent, suppressed or already a member.
    return {"invited": len(rows), "remaining_today": await _remaining(db, me)}


def _page(title: str, body: str) -> HTMLResponse:
    return HTMLResponse(
        "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'>"
        f"<title>{html_lib.escape(title)}</title>"
        '<body style="font-family:Arial,sans-serif;max-width:520px;margin:40px auto;padding:0 16px">'
        f"<h1>{html_lib.escape(title)}</h1>{body}</body>"
    )


def _check_stop(h: str, t: str) -> None:
    if len(h) != 64 or not hmac.compare_digest(t, stop_token(h)):
        raise HTTPException(status_code=404, detail="This link is not valid.")


@router.get("/stop", response_class=HTMLResponse, summary="Stop invitations (confirm page)")
async def stop_invites_page(
    h: str = Query(max_length=64), t: str = Query(max_length=64)
) -> HTMLResponse:
    """A confirm button, so mail scanners that open links do not unsubscribe."""
    _check_stop(h, t)
    return _page(
        "Stop invitations",
        "<p>Members will no longer be able to email you invitations to Remote AI Platform.</p>"
        "<form method=post><input type=hidden name=h value='"
        + html_lib.escape(h)
        + "'><input type=hidden name=t value='"
        + html_lib.escape(t)
        + "'><button type=submit>Stop all invitations</button></form>",
    )


@router.post("/stop", response_class=HTMLResponse, summary="Stop invitations to this address")
async def stop_invites(
    h: str = Form(max_length=64), t: str = Form(max_length=64), db: AsyncSession = Depends(get_db)
) -> HTMLResponse:
    _check_stop(h, t)
    if await db.get(InviteSuppression, h) is None:
        db.add(InviteSuppression(email_hash=h))
        await db.commit()
    return _page("Done", "<p>You won't receive invitations to Remote AI Platform again.</p>")
