"""Opt-in Google contacts finder: OAuth state/PKCE, privacy-preserving matching,
invites with a daily cap, suppression, and nothing stored but chosen invites."""

import base64
import hashlib
import json
import time
import uuid
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from auth_support import token_for
from conftest import TestingSessionLocal
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.domains.auth.models import User, UserRole
from app.domains.engineers.models import EngineerProfile
from app.domains.network import contacts
from app.domains.network.models import (
    Connection,
    ContactInvite,
    InviteSuppression,
    MemberInvite,
    UserBlock,
)
from app.services.email.service import EmailResult

ORIGIN = "https://remoteaiplatform.com"
REDIRECT = f"{ORIGIN}/contacts/callback"


class FakeGoogle:
    def __init__(self) -> None:
        self.other: list[dict] = []
        self.connections: list[dict] = []
        self.calls: list[str] = []
        self.token_body: dict = {}
        self.revoked: list[str] = []
        self.deny_connections = False
        self.token_status = 200

    def handler(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        self.calls.append(url)
        if url.startswith(contacts.GOOGLE_TOKEN_URL):
            self.token_body = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
            if self.token_status != 200:
                return httpx.Response(self.token_status, json={"error": "invalid_grant"})
            return httpx.Response(200, json={"access_token": "ya29.secret", "expires_in": 3599})
        if url.startswith(contacts.GOOGLE_REVOKE_URL):
            self.revoked.append(parse_qs(request.content.decode())["token"][0])
            return httpx.Response(200)
        assert request.headers["Authorization"] == "Bearer ya29.secret"
        if "/otherContacts" in url:
            if "pageToken=p2" in url:
                return httpx.Response(200, json={"otherContacts": self.other[1:]})
            return httpx.Response(200, json={"otherContacts": self.other[:1], "nextPageToken": "p2"})
        if "/people/me/connections" in url:
            if self.deny_connections:
                return httpx.Response(403, json={})
            return httpx.Response(200, json={"connections": self.connections})
        return httpx.Response(404)


def person(email: str, name: str = "") -> dict:
    return {"names": [{"displayName": name}] if name else [], "emailAddresses": [{"value": email}]}


class FakeMail:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str]] = []
        self.fail: set[str] = set()

    async def send_email(self, to, subject, html, idempotency_key=None):  # noqa: ANN001
        if to in self.fail:
            return EmailResult(sent=False, error="HTTP 422", retryable=False)
        self.sent.append((to, subject, html))
        return EmailResult(sent=True, provider_message_id="m1")


@pytest.fixture
def google(monkeypatch):
    fake = FakeGoogle()
    monkeypatch.setattr(settings, "FEATURE_CONTACTS_IMPORT", True)
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "cid.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "gsecret")
    monkeypatch.setattr(settings, "CORS_ORIGINS_RAW", ORIGIN)
    monkeypatch.setattr(contacts, "transport", httpx.MockTransport(fake.handler))
    return fake


@pytest.fixture
def mail(monkeypatch):
    fake = FakeMail()
    monkeypatch.setattr(contacts, "get_email_provider", lambda: fake)
    return fake


async def _user(name: str, email: str, public: bool = True, role=UserRole.ENGINEER, active=True) -> User:
    async with TestingSessionLocal() as db:
        u = User(id=uuid.uuid4(), auth_subject=str(uuid.uuid4()), email=email, full_name=name, role=role, is_active=active)
        db.add(u)
        await db.flush()
        db.add(EngineerProfile(user_id=u.id, skills=[], is_public=public, headline=f"{name} headline"))
        await db.commit()
        return u


def _h(u: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {token_for(u)}"}


async def _start(client: AsyncClient, me: User) -> str:
    res = await client.post("/api/v1/contacts/google/authorize", json={"redirect_uri": REDIRECT}, headers=_h(me))
    assert res.status_code == 200, res.text
    return res.json()["url"]


async def _import(client: AsyncClient, me: User) -> dict:
    url = await _start(client, me)
    state = parse_qs(urlparse(url).query)["state"][0]
    res = await client.post(
        "/api/v1/contacts/google/import",
        json={"code": "4/0AcodeXYZ", "state": state, "redirect_uri": REDIRECT},
        headers=_h(me),
    )
    assert res.status_code == 200, res.text
    return res.json()


@pytest.mark.asyncio
async def test_flag_off_by_default_hides_everything(client: AsyncClient):
    me = await _user("Me", "me@x.org")
    assert settings.FEATURE_CONTACTS_IMPORT is False
    assert (await client.get("/api/v1/contacts/google/status", headers=_h(me))).json() == {"enabled": False}
    res = await client.post("/api/v1/contacts/google/authorize", json={"redirect_uri": REDIRECT}, headers=_h(me))
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_authorize_url_requests_readonly_scopes_online_with_pkce(client: AsyncClient, google):
    me = await _user("Me", "me@x.org")
    assert (await client.get("/api/v1/contacts/google/status", headers=_h(me))).json() == {"enabled": True}
    q = parse_qs(urlparse(await _start(client, me)).query)
    assert q["scope"][0].split() == list(contacts.SCOPES)
    assert q["access_type"] == ["online"]  # no refresh token
    assert q["include_granted_scopes"] == ["true"]
    assert q["code_challenge_method"] == ["S256"]
    assert q["redirect_uri"] == [REDIRECT]
    assert "code_verifier" not in q
    for bad in ("https://evil.example/contacts/callback", f"{ORIGIN}/elsewhere", f"{REDIRECT}?x=1"):
        res = await client.post("/api/v1/contacts/google/authorize", json={"redirect_uri": bad}, headers=_h(me))
        assert res.status_code == 422


@pytest.mark.asyncio
async def test_import_pkce_matching_privacy_and_token_discarded(client: AsyncClient, google):
    me = await _user("Me", "me@x.org")
    friend = await _user("Friend", "friend@x.org")
    await _user("Hidden", "hidden@x.org", public=False)
    blocker = await _user("Blocker", "blocker@x.org")
    await _user("Staff", "staff@x.org", role=UserRole.ADMIN)
    await _user("Gone", "gone@x.org", active=False)
    async with TestingSessionLocal() as db:
        db.add(UserBlock(blocker_id=blocker.id, blocked_id=me.id))
        db.add(Connection(sender_id=me.id, receiver_id=friend.id, status="PENDING"))
        await db.commit()
    google.other = [person("Friend@X.org", "Friend"), person("hidden@x.org", "Hid"), person("stranger@y.org", "Stranger")]
    google.connections = [
        person("blocker@x.org"), person("staff@x.org"), person("gone@x.org"),
        person("me@x.org"), person("not-an-email"),
    ]
    out = await _import(client, me)

    # PKCE: the verifier sent to Google matches the challenge from authorize.
    url = google.calls[0]
    assert url.startswith(contacts.GOOGLE_TOKEN_URL)
    verifier = google.token_body["code_verifier"]
    assert google.token_body["redirect_uri"] == REDIRECT
    assert len(verifier) >= 43
    # Token revoked right after the read.
    assert google.revoked == ["ya29.secret"]
    assert "ya29" not in json.dumps(out)

    assert [m["full_name"] for m in out["matches"]] == ["Friend"]
    assert out["matches"][0]["connection_status"] == "PENDING"
    assert "email" not in out["matches"][0]
    # Hidden, blocked, staff and inactive accounts look exactly like non-members.
    invitable = {c["email"] for c in out["invitable"]}
    assert invitable == {"hidden@x.org", "stranger@y.org", "blocker@x.org", "staff@x.org", "gone@x.org"}
    assert all(set(c) == {"email", "name", "token", "invited"} for c in out["invitable"])
    assert out["remaining_today"] == 25
    # Nothing about the contact list was stored.
    async with TestingSessionLocal() as db:
        assert (await db.execute(select(ContactInvite))).scalars().all() == []


@pytest.mark.asyncio
async def test_challenge_matches_verifier(client: AsyncClient, google):
    me = await _user("Me", "me@x.org")
    q = parse_qs(urlparse(await _start(client, me)).query)
    nonce = q["state"][0].split(".")[2]
    verifier = contacts._verifier(nonce)
    digest = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    assert q["code_challenge"] == [digest]


@pytest.mark.asyncio
async def test_state_bound_to_member_signed_and_expiring(client: AsyncClient, google):
    me = await _user("Me", "me@x.org")
    other = await _user("Other", "other@x.org")
    state = parse_qs(urlparse(await _start(client, me)).query)["state"][0]
    body = {"code": "4/0AcodeXYZ", "redirect_uri": REDIRECT}
    # Someone else's state.
    res = await client.post("/api/v1/contacts/google/import", json={**body, "state": state}, headers=_h(other))
    assert res.status_code == 400
    # Tampered signature.
    res = await client.post("/api/v1/contacts/google/import", json={**body, "state": state[:-2] + "xx"}, headers=_h(me))
    assert res.status_code == 400
    # Expired.
    old = contacts.make_state(me.id, now=time.time() - 3600)
    res = await client.post("/api/v1/contacts/google/import", json={**body, "state": old}, headers=_h(me))
    assert res.status_code == 400
    res = await client.post("/api/v1/contacts/google/import", json={**body, "state": "a.b.c" + "x" * 20}, headers=_h(me))
    assert res.status_code == 400
    assert google.calls == []


@pytest.mark.asyncio
async def test_google_errors_and_partial_scope(client: AsyncClient, google):
    me = await _user("Me", "me@x.org")
    google.deny_connections = True
    google.other = [person("a@y.org", "A")]
    out = await _import(client, me)
    assert [c["email"] for c in out["invitable"]] == ["a@y.org"]
    google.token_status = 400
    state = parse_qs(urlparse(await _start(client, me)).query)["state"][0]
    res = await client.post(
        "/api/v1/contacts/google/import",
        json={"code": "4/0AcodeXYZ", "state": state, "redirect_uri": REDIRECT},
        headers=_h(me),
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_invites_only_selected_hash_only_and_uniform(client: AsyncClient, google, mail):
    me = await _user("Me", "me@x.org")
    await _user("Hidden", "hidden@x.org", public=False)
    async with TestingSessionLocal() as db:
        db.add(InviteSuppression(email_hash=contacts.email_hash("stop@y.org")))
        await db.commit()
    google.other = [person("a@y.org", "A"), person("b@y.org", "B"), person("stop@y.org"), person("hidden@x.org")]
    out = await _import(client, me)
    tokens = {c["email"]: c["token"] for c in out["invitable"]}
    chosen = [{"email": e, "token": tokens[e]} for e in ("a@y.org", "stop@y.org", "hidden@x.org")]
    res = await client.post("/api/v1/contacts/invites", json={"contacts": chosen}, headers=_h(me))
    assert res.status_code == 200, res.text
    assert res.json() == {"invited": 3, "remaining_today": 22}
    # Only the non-member, non-suppressed selected address got an email; b@ was not selected.
    assert [s[0] for s in mail.sent] == ["a@y.org"]
    to, subject, html = mail.sent[0]
    assert "Me invited you" in subject
    assert "/api/v1/contacts/stop?h=" in html
    assert "#network?invite=" in html
    async with TestingSessionLocal() as db:
        rows = (await db.execute(select(ContactInvite))).scalars().all()
        assert {r.status for r in rows} == {"SENT", "SKIPPED"}
        assert all(r.email is None for r in rows)  # hash only after the send
        assert {r.email_hash for r in rows} == {contacts.email_hash(e) for e in ("a@y.org", "stop@y.org", "hidden@x.org")}
        assert len((await db.execute(select(MemberInvite))).scalars().all()) == 1
    # Re-inviting is a no-op, and the next read marks them as invited.
    res = await client.post("/api/v1/contacts/invites", json={"contacts": chosen[:1]}, headers=_h(me))
    assert res.json()["invited"] == 0
    again = await _import(client, me)
    assert {c["email"]: c["invited"] for c in again["invitable"]}["a@y.org"] is True


@pytest.mark.asyncio
async def test_invite_requires_token_from_own_read(client: AsyncClient, google, mail):
    me = await _user("Me", "me@x.org")
    other = await _user("Other", "other@x.org")
    forged = [{"email": "victim@y.org", "token": contacts.contact_token(other.id, "victim@y.org")}]
    res = await client.post("/api/v1/contacts/invites", json={"contacts": forged}, headers=_h(me))
    assert res.status_code == 400
    expired = [{"email": "victim@y.org", "token": contacts.contact_token(me.id, "victim@y.org", now=time.time() - 7200)}]
    res = await client.post("/api/v1/contacts/invites", json={"contacts": expired}, headers=_h(me))
    assert res.status_code == 400
    assert mail.sent == []


@pytest.mark.asyncio
async def test_daily_cap_of_25(client: AsyncClient, google, mail):
    me = await _user("Me", "me@x.org")
    batch = lambda start: [  # noqa: E731
        {"email": f"p{i}@y.org", "token": contacts.contact_token(me.id, f"p{i}@y.org")} for i in range(start, start + 20)
    ]
    assert (await client.post("/api/v1/contacts/invites", json={"contacts": batch(0)}, headers=_h(me))).status_code == 200
    res = await client.post("/api/v1/contacts/invites", json={"contacts": batch(20)}, headers=_h(me))
    assert res.status_code == 429
    assert "5 left today" in res.json()["detail"]
    assert len(mail.sent) == 20
    too_many = [{"email": f"q{i}@y.org", "token": "x"} for i in range(26)]
    assert (await client.post("/api/v1/contacts/invites", json={"contacts": too_many}, headers=_h(me))).status_code == 422


@pytest.mark.asyncio
async def test_failed_send_keeps_hash_only(client: AsyncClient, google, mail):
    me = await _user("Me", "me@x.org")
    mail.fail.add("bad@y.org")
    body = {"contacts": [{"email": "bad@y.org", "token": contacts.contact_token(me.id, "bad@y.org")}]}
    assert (await client.post("/api/v1/contacts/invites", json=body, headers=_h(me))).status_code == 200
    async with TestingSessionLocal() as db:
        row = (await db.execute(select(ContactInvite))).scalar_one()
        assert row.status == "FAILED"
        assert row.email is None


@pytest.mark.asyncio
async def test_stop_link_confirms_then_suppresses(client: AsyncClient, google, mail):
    h = contacts.email_hash("someone@y.org")
    t = contacts.stop_token(h)
    page = await client.get("/api/v1/contacts/stop", params={"h": h, "t": t})
    assert page.status_code == 200
    assert "<form method=post>" in page.text
    async with TestingSessionLocal() as db:
        assert await db.get(InviteSuppression, h) is None  # GET alone changes nothing
    assert (await client.get("/api/v1/contacts/stop", params={"h": h, "t": "bad"})).status_code == 404
    assert (await client.post("/api/v1/contacts/stop", data={"h": h, "t": "bad"})).status_code == 404
    for _ in range(2):  # idempotent
        assert (await client.post("/api/v1/contacts/stop", data={"h": h, "t": t})).status_code == 200
    async with TestingSessionLocal() as db:
        assert await db.get(InviteSuppression, h) is not None
    # Suppressed address is never emailed later.
    me = await _user("Me", "me@x.org")
    body = {"contacts": [{"email": "someone@y.org", "token": contacts.contact_token(me.id, "someone@y.org")}]}
    assert (await client.post("/api/v1/contacts/invites", json=body, headers=_h(me))).json()["invited"] == 1
    assert mail.sent == []
