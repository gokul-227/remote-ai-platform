"""Slack as a control surface: /rap, interactivity, identities, alerts.

Slack itself is faked (httpx.MockTransport for chat.postMessage and response_url).
"""

import json
import time
import uuid
from urllib.parse import urlencode

import httpx
import pytest
from auth_support import token_for
from conftest import TestingSessionLocal
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.domains.admin.models import AuditEvent
from app.domains.auth.models import User, UserRole
from app.domains.slack import commands, identity, security, service
from app.domains.slack.models import SlackIdentity
from app.services import slack

SECRET = "test-signing-secret"
RESPONSE_URL = "https://hooks.slack.com/commands/T1/1/abc"


@pytest.fixture(autouse=True)
def slack_env(monkeypatch):
    monkeypatch.setattr(settings, "SLACK_SIGNING_SECRET", SECRET)
    monkeypatch.setattr(settings, "SLACK_BOT_TOKEN", "xoxb-test")
    monkeypatch.setattr(settings, "SLACK_CHANNEL_SECURITY", "C_SEC")
    monkeypatch.setattr(settings, "SLACK_CHANNEL_SIGNUPS", "C_SIGN")
    monkeypatch.setattr(settings, "SLACK_CHANNEL_ALERTS_CRITICAL", "C_CRIT")
    monkeypatch.setattr(settings, "SLACK_CHANNEL_JOB_IMPORTS", "C_JOB")
    slack.reset()
    yield
    slack.reset()


@pytest.fixture
def outbox(monkeypatch):
    """Everything sent to Slack: ("post", body) or ("respond", body)."""
    sent: list[tuple[str, dict]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        kind = "post" if str(request.url) == slack.POST_URL else "respond"
        sent.append((kind, body))
        return httpx.Response(200, json={"ok": True})

    monkeypatch.setattr(slack, "_transport", httpx.MockTransport(handler))

    async def inline(**kwargs):  # run "background" work immediately
        await service.run(**kwargs)

    monkeypatch.setattr(service, "dispatch", inline)
    return sent


def responses(sent):
    return [b for k, b in sent if k == "respond"]


def signed(body: str, ts: int | None = None) -> dict[str, str]:
    ts = ts or int(time.time())
    sig = security.sign(f"v0:{ts}:{body}".encode())
    return {
        "X-Slack-Request-Timestamp": str(ts),
        "X-Slack-Signature": sig,
        "Content-Type": "application/x-www-form-urlencoded",
    }


async def slash(client: AsyncClient, text: str, user: str = "U1", team: str = "T1"):
    body = urlencode(
        {
            "user_id": user,
            "team_id": team,
            "user_name": "owner",
            "text": text,
            "response_url": RESPONSE_URL,
            "command": "/rap",
        }
    )
    return await client.post("/api/v1/slack/commands", content=body, headers=signed(body))


async def click(client: AsyncClient, action_id: str, value: str, user: str = "U1"):
    payload = {
        "type": "block_actions",
        "user": {"id": user, "team_id": "T1"},
        "team": {"id": "T1"},
        "response_url": RESPONSE_URL,
        "actions": [{"action_id": action_id, "value": value}],
    }
    body = urlencode({"payload": json.dumps(payload)})
    return await client.post("/api/v1/slack/interactions", content=body, headers=signed(body))


async def make_user(role=UserRole.ADMIN, email=None, active=True) -> User:
    async with TestingSessionLocal() as db:
        u = User(
            email=email or f"{uuid.uuid4().hex[:8]}@example.com",
            full_name="Someone",
            role=role,
            is_active=active,
            auth_subject=str(uuid.uuid4()),
        )
        db.add(u)
        await db.commit()
        await db.refresh(u)
        return u


async def link(user: User, slack_user: str = "U1") -> None:
    async with TestingSessionLocal() as db:
        db.add(SlackIdentity(slack_user_id=slack_user, slack_team_id="T1", user_id=user.id))
        await db.commit()


async def audit_rows(action: str) -> list[AuditEvent]:
    async with TestingSessionLocal() as db:
        return list(
            (await db.execute(select(AuditEvent).where(AuditEvent.action == action))).scalars()
        )


# ── signature ─────────────────────────────────────────────────────────────


def test_signature_verification():
    body = b"text=status"
    now = 1_700_000_000
    sig = security.sign(f"v0:{now}:".encode() + body)
    assert security.verify(body, str(now), sig, now=now)
    assert security.verify(body, str(now), sig, now=now + 299)
    assert not security.verify(body, str(now), sig, now=now + 301)  # replay window
    assert not security.verify(body, str(now), sig, now=now - 301)
    assert not security.verify(body + b"x", str(now), sig, now=now)  # tampered
    assert not security.verify(body, str(now), "v0=deadbeef", now=now)
    assert not security.verify(body, "abc", sig, now=now)
    assert not security.verify(body, None, sig, now=now)


def test_signature_refused_without_secret(monkeypatch):
    monkeypatch.setattr(settings, "SLACK_SIGNING_SECRET", "")
    assert not security.verify(b"x", str(int(time.time())), "v0=00")


@pytest.mark.asyncio
async def test_endpoints_reject_bad_signature(client: AsyncClient):
    body = "text=status&user_id=U1"
    headers = signed(body)
    headers["X-Slack-Signature"] = "v0=" + "0" * 64
    res = await client.post("/api/v1/slack/commands", content=body, headers=headers)
    assert res.status_code == 401
    stale = signed(body, ts=int(time.time()) - 600)
    res = await client.post("/api/v1/slack/interactions", content=body, headers=stale)
    assert res.status_code == 401


def test_confirm_token_bound_to_user_and_expiry():
    tok = security.confirm_token("U1", "users delete x", now=1000)
    assert security.read_confirm_token(tok, "U1", now=1001) == "users delete x"
    assert security.read_confirm_token(tok, "U2", now=1001) is None
    assert security.read_confirm_token(tok, "U1", now=1000 + 3600) is None
    forged = tok.split(".")[0] + ".0000"
    assert security.read_confirm_token(forged, "U1", now=1001) is None
    assert security.read_confirm_token("garbage", "U1") is None


# ── identity and authorisation ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unlinked_user_is_not_authorised(client: AsyncClient, outbox):
    res = await slash(client, "status")
    assert res.status_code == 200
    assert "Not authorised" in res.json()["text"]
    await slack.drain()
    assert any(b["channel"] == "C_SEC" for k, b in outbox if k == "post")


@pytest.mark.asyncio
async def test_help_needs_no_link(client: AsyncClient, outbox):
    res = await slash(client, "help")
    text = res.json()["text"]
    assert "`/rap users`" in text
    assert "suspend :lock:" in text
    assert "`/rap billing`" in text
    res = await slash(client, "help billing")
    assert "billing refund" in res.json()["text"]
    assert "users find" not in res.json()["text"]


@pytest.mark.asyncio
async def test_link_with_console_code(client: AsyncClient, outbox):
    admin = await make_user()
    headers = {"Authorization": f"Bearer {token_for(admin)}"}
    res = await client.post("/api/v1/admin/slack/link-code", headers=headers)
    assert res.status_code == 201
    code = res.json()["code"]

    bad = await slash(client, "link WRONG-CODE")
    assert "not valid" in bad.json()["text"]
    ok = await slash(client, f"link {code}")
    assert "Linked to staff account" in ok.json()["text"]
    again = await slash(client, f"link {code}", user="U9")  # one-time
    assert "not valid" in again.json()["text"]

    me = await slash(client, "whoami")
    assert admin.email in me.json()["text"]
    listed = await client.get("/api/v1/admin/slack/identities", headers=headers)
    assert [i["slack_user_id"] for i in listed.json()] == ["U1"]
    assert await audit_rows("slack.identity.link")

    gone = await client.delete(
        f"/api/v1/admin/slack/identities/{listed.json()[0]['id']}", headers=headers
    )
    assert gone.status_code == 204
    assert "Not authorised" in (await slash(client, "whoami")).json()["text"]


@pytest.mark.asyncio
async def test_link_code_requires_staff(client: AsyncClient, auth_headers):
    res = await client.post("/api/v1/admin/slack/link-code", headers=auth_headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_expired_code_and_demoted_staff(client: AsyncClient, outbox, monkeypatch):
    admin = await make_user()
    monkeypatch.setattr(settings, "SLACK_LINK_CODE_MINUTES", -1)
    async with TestingSessionLocal() as db:
        code, _ = await identity.create_link_code(db, admin)
        await db.commit()
    assert "not valid" in (await slash(client, f"link {code}")).json()["text"]

    member = await make_user(role=UserRole.ENGINEER)
    await link(member, "U2")
    assert "Not authorised" in (await slash(client, "status", user="U2")).json()["text"]
    suspended = await make_user(active=False)
    await link(suspended, "U3")
    assert "Not authorised" in (await slash(client, "status", user="U3")).json()["text"]
    other_team = await make_user()
    await link(other_team, "U4")
    assert "Not authorised" in (await slash(client, "status", user="U4", team="T2")).json()["text"]


@pytest.mark.asyncio
async def test_unlink_from_slack(client: AsyncClient, outbox):
    admin = await make_user()
    await link(admin)
    assert "Unlinked" in (await slash(client, "unlink")).json()["text"]
    assert "Not authorised" in (await slash(client, "whoami")).json()["text"]


# ── commands end to end (in-process API) ──────────────────────────────────


@pytest.mark.asyncio
async def test_read_command_runs_in_background_and_audits(client: AsyncClient, outbox):
    admin = await make_user(email="boss@example.com")
    await link(admin)
    await make_user(role=UserRole.ENGINEER, email="findme@example.com")
    res = await slash(client, "users find findme")
    assert "Working on" in res.json()["text"]
    reply = responses(outbox)[-1]
    assert "findme@example.com" in reply["text"]
    rows = await audit_rows("slack.command")
    assert rows
    assert rows[-1].actor_id == admin.id
    assert rows[-1].payload["channel"] == "slack"
    assert rows[-1].payload["command"] == "users find"


@pytest.mark.asyncio
async def test_destructive_command_needs_confirmation(client: AsyncClient, outbox):
    admin = await make_user()
    await link(admin)
    target = await make_user(role=UserRole.ENGINEER, email="victim@example.com")
    res = await slash(client, "users suspend victim@example.com spam account")
    body = res.json()
    assert body["blocks"][1]["elements"][0]["action_id"] == "rap_confirm"
    token = body["blocks"][1]["elements"][0]["value"]

    # Another Slack user cannot confirm it.
    other = await make_user()
    await link(other, "U7")
    await click(client, "rap_confirm", token, user="U7")
    assert "expired or is not yours" in responses(outbox)[-1]["text"]
    async with TestingSessionLocal() as db:
        assert (await db.get(User, target.id)).is_active

    await click(client, "rap_confirm", token)
    assert "suspended" in responses(outbox)[-1]["text"]
    assert responses(outbox)[-1]["replace_original"] is True
    async with TestingSessionLocal() as db:
        assert not (await db.get(User, target.id)).is_active
    status_rows = await audit_rows("admin.user.status")
    assert status_rows[-1].actor_id == admin.id
    assert status_rows[-1].payload["channel"] == "slack"
    assert status_rows[-1].payload["reason"] == "spam account"


@pytest.mark.asyncio
async def test_cancel_button(client: AsyncClient, outbox):
    await click(client, "rap_cancel", "cancel")
    assert responses(outbox)[-1]["text"] == "Cancelled."


@pytest.mark.asyncio
async def test_api_errors_are_reported(client: AsyncClient, outbox):
    admin = await make_user()
    await link(admin)
    await slash(client, f"jobs hide {uuid.uuid4()}")
    assert responses(outbox)[-1]["text"].startswith(":x:")
    await slash(client, "jobs hide not-a-uuid")
    assert "not a valid" in responses(outbox)[-1]["text"]
    res = await slash(client, "jobs hide")
    assert "Usage" in res.json()["text"]
    res = await slash(client, "nonsense here")
    assert "Unknown command" in res.json()["text"]


@pytest.mark.asyncio
async def test_staff_scope_still_applies(client: AsyncClient, outbox):
    from app.domains.admin.staff import StaffRole

    admin = await make_user()
    async with TestingSessionLocal() as db:
        db.add(StaffRole(user_id=admin.id, role="support"))
        await db.commit()
    await link(admin)
    await slash(client, "sources pause remotive")
    assert responses(outbox)[-1]["text"].startswith(":no_entry:")


@pytest.mark.asyncio
async def test_slack_actor_cannot_be_set_by_headers(client: AsyncClient):
    admin = await make_user()
    res = await client.get("/api/v1/admin/stats", headers={"rap.slack_actor": str(admin.id)})
    assert res.status_code == 401


# ── alert buttons ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_alert_ack_and_command_buttons(client: AsyncClient, outbox):
    admin = await make_user()
    await link(admin)
    await click(client, "rap_alert", "ack")
    assert "Acknowledged by <@U1>" in responses(outbox)[-1]["text"]
    assert await audit_rows("slack.alert.ack")

    await click(client, "rap_alert", "cmd:sources pause no-such-source")
    last = responses(outbox)[-1]
    assert last["response_type"] == "in_channel"
    assert last["text"].startswith(":x:")

    await click(client, "rap_alert", "cmd:users delete someone@example.com")
    assert responses(outbox)[-1]["blocks"][1]["elements"][0]["action_id"] == "rap_confirm"

    await click(client, "rap_alert", "ack", user="U_STRANGER")
    assert "Not authorised" in responses(outbox)[-1]["text"]


@pytest.mark.asyncio
async def test_alert_buttons_shape():
    blocks = slack.alert_buttons(slack.button("Retry", "rap_alert", "cmd:imports retry x"))
    values = [e["value"] for e in blocks[0]["elements"]]
    assert values == ["cmd:imports retry x", "ack"]


@pytest.mark.asyncio
async def test_post_with_actions_sends_blocks(outbox):
    ok = await slack.post("critical", "Dead letter", actions=slack.alert_buttons(), fields={"a": 1})
    assert ok
    body = [b for k, b in outbox if k == "post"][-1]
    assert body["blocks"][0]["type"] == "section"
    assert body["blocks"][1]["type"] == "actions"


@pytest.mark.asyncio
async def test_respond_refuses_foreign_urls(outbox):
    assert not await slack.respond("https://evil.example.com/x", {"text": "hi"})
    assert await slack.respond(RESPONSE_URL, {"text": "hi"})


def test_payments_and_kpis_fall_back_to_signups(monkeypatch):
    monkeypatch.setattr(settings, "SLACK_CHANNEL_PAYMENTS", "")
    assert slack.channel_id("payments") == "C_SIGN"
    monkeypatch.setattr(settings, "SLACK_CHANNEL_PAYMENTS", "C_PAY")
    assert slack.channel_id("payments") == "C_PAY"
    assert slack.channel_id("kpis") == "C_SIGN"


# ── every handler with a mocked API ───────────────────────────────────────


class FakeApi:
    def __init__(self, data: dict[str, object] | None = None, fail: Exception | None = None):
        self.calls: list[tuple[str, str, object]] = []
        self.data = data or {}
        self.fail = fail

    async def _answer(self, method: str, path: str, payload: object):
        self.calls.append((method, path, payload))
        if self.fail:
            raise self.fail
        for prefix, value in self.data.items():
            if method == "GET" and path.startswith(prefix):
                return value
        return {"id": "x1", "status": "ok", "email": "a@example.com", "version": 1}

    async def get(self, path, **params):
        return await self._answer("GET", path, params)

    async def post(self, path, body=None, **params):
        return await self._answer("POST", path, body)

    async def patch(self, path, body=None):
        return await self._answer("PATCH", path, body)

    async def put(self, path, body=None):
        return await self._answer("PUT", path, body)

    async def delete(self, path):
        return await self._answer("DELETE", path, None)


U = str(uuid.uuid4())
USERS = [{"id": U, "email": "a@example.com", "role": "ENGINEER", "is_active": True}]
LISTS = {
    "/admin/users": USERS,
    "/admin/jobs": [{"id": U, "title": "Dev", "is_active": True}],
    "/admin/background/sources": [{"name": "remotive", "enabled": True, "cron": "0 * * * *"}],
    "/admin/background/runs": [{"id": U, "status": "DEAD", "task_name": "jobs.import_source"}],
    "/admin/background/dead-letters": [{"id": U, "task_name": "t"}],
    "/admin/feature-flags/state": [{"name": "x", "effective": True}],
    "/moderation/reports": [
        {"id": U, "status": "OPEN", "target_type": "JOB"},
        {"id": U, "status": "RESOLVED", "decision": "NO_ACTION"},
    ],
    "/admin/billing/plans": [{"slug": "hire", "price_cents": 1900}],
    "/admin/billing": [{"id": U, "status": "paid"}],
    "/admin/announcements": [{"id": U, "title": "t"}],
    "/admin/staff-roles": [{"email": "a@example.com", "roles": ["super_admin"]}],
    "/trust/verifications": [{"id": U, "status": "PENDING"}],
    "/companies/public": [{"id": U, "name": "Acme"}],
    "/admin/audit-events": [{"action": "admin.user.role"}],
    "/admin/contracts": [{"id": U}],
    "/admin/assistant-actions": [{"tool": "t"}],
}

CASES = [
    "status",
    "stats",
    "users find a@example.com",
    "users suspended",
    f"users view {U}",
    "users view a@example.com",
    "users suspend a@example.com",
    "users unsuspend a@example.com because",
    "users role a@example.com company",
    "users signout a@example.com",
    "users delete a@example.com",
    "staff list",
    "staff roles a@example.com support,moderator",
    "verifications list",
    f"verifications review {U} verified ok",
    "companies list acme",
    "jobs search dev",
    "jobs hidden",
    f"jobs hide {U}",
    f"jobs unhide {U}",
    f"jobs delete {U}",
    "contracts list active",
    "projects list",
    "projects summary",
    "sources list",
    "sources pause remotive",
    "sources resume remotive",
    "sources run remotive",
    'sources cron remotive "0 */2 * * *"',
    "sources boards greenhouse",
    "imports runs dead",
    "imports failures",
    "imports deadletters",
    f"imports retry {U}",
    "tasks overview",
    "tasks runs failed jobs.import_source",
    "flags list",
    "flags set x on",
    "flags set x default why",
    "reports queue",
    "reports history",
    f"reports resolve {U} hide_job spam",
    f"reports dismiss {U}",
    "billing revenue",
    "billing subs active",
    "billing purchases paid",
    "billing entitlements a@example.com",
    "billing plans",
    f"billing refund {U} 500 duplicate",
    f"billing refund {U}",
    "billing grant a@example.com featured_job 2 30 promo",
    f"billing revoke {U}",
    "billing price hire 2900 new price",
    f"billing fulfil {U} done",
    "announce list",
    "announce create WARNING Maintenance | Back at 10:00",
    "broadcast Hello everyone",
    f"announce end {U}",
    "tickets list",
    "tickets list overdue",
    "tickets list mine",
    "tickets list resolved",
    f"tickets view {U}",
    f"tickets reply {U} Thanks, fixed",
    f"tickets note {U} internal",
    f"tickets status {U} resolved",
    "incidents list open",
    "incidents open SEV2 api Slow responses | p95 up",
    f"incidents status {U} acknowledged",
    "seo",
    "backups",
    "usage",
    "ai usage",
    "ai actions",
    "catalogue",
    "inventory",
    "integrations",
    "audit admin.",
    "security",
]


@pytest.mark.asyncio
@pytest.mark.parametrize("text", CASES)
async def test_every_handler(text):
    api = FakeApi(LISTS)
    cmd, args = commands.parse(text)
    assert cmd is not None, text
    ctx = commands.Ctx(api, "U1", uuid.uuid4())  # type: ignore[arg-type]
    reply = await cmd.handler(ctx, args)
    assert isinstance(reply, str)
    assert reply
    assert api.calls


@pytest.mark.asyncio
async def test_handler_validation_errors():
    ctx = commands.Ctx(FakeApi({"/admin/users": USERS * 2}), "U1", uuid.uuid4())  # type: ignore[arg-type]
    for text in [
        "users suspend a@example.com",  # ambiguous match
        "flags set x maybe",
        "billing price hire cheap",
        "announce create INFO",
        "tickets reply " + U,
    ]:
        cmd, args = commands.parse(text)
        with pytest.raises(commands.UsageError):
            await cmd.handler(ctx, args)


def test_help_lists_every_command_and_marks_confirmations():
    assert len(commands.help_text()) < 3900  # fits one Slack message
    for name, cmd in commands.REGISTRY.items():
        if name == cmd.name:
            assert f"/rap {name}" in commands.help_text(name.split(" ")[0])
    assert ":lock:" in commands.help_text("billing")


def test_formatting_helpers():
    assert "nothing found" in commands.rows([], ["id"], "X")
    many = commands.rows([{"id": i} for i in range(20)], ["id"], "X")
    assert "5 more" in many
    assert commands.obj(5, "T") == "*T*: 5"
    assert commands._val(None) == "—"
    assert commands._val(1.5) == "1.50"
    assert commands._val(list(range(10))).endswith("…")
    assert commands.reason(["a"], 0) == commands.DEFAULT_REASON
    assert commands.tokenize('a "b c') == ["a", '"b', "c"]


# ── billing and KPI alerts ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_billing_events_post_to_payments(outbox, monkeypatch):
    from app.domains.billing import service as billing

    monkeypatch.setattr(settings, "SLACK_CHANNEL_PAYMENTS", "C_PAY")
    billing.billing_alert(
        "checkout.session.completed",
        {"id": "cs_1", "payment_status": "paid", "amount_total": 1900, "currency": "eur"},
    )
    billing.billing_alert("checkout.session.completed", {"id": "cs_2", "payment_status": "unpaid"})
    billing.billing_alert("invoice.paid", {"id": "in_0", "amount_paid": 0})
    billing.billing_alert(
        "invoice.payment_failed", {"id": "in_1", "amount_due": 900, "attempt_count": 2}
    )
    billing.billing_alert("charge.refunded", {"id": "ch_1", "amount_refunded": 500})
    billing.billing_alert("customer.subscription.created", {"id": "sub_1"})
    billing.billing_alert("checkout.session.expired", {"id": "cs_3"})
    await slack.drain()
    texts = [b["text"] for k, b in outbox if k == "post" and b["channel"] == "C_PAY"]
    assert len(texts) == 4
    assert any("19.00 EUR" in t for t in texts)
    assert any("Payment failed" in t for t in texts)


@pytest.mark.asyncio
async def test_daily_kpi_digest(outbox, monkeypatch):
    from app.worker import ops

    await make_user(role=UserRole.ENGINEER)
    async with TestingSessionLocal() as db:
        out = await ops.daily_kpi_digest(db)
    assert out["users"] == 1
    assert out["new sign-ups (24 h)"] == 1
    assert any("Daily KPIs" in b["text"] for k, b in outbox if k == "post")
    monkeypatch.setattr(settings, "SLACK_KPI_DIGEST_ENABLED", False)
    async with TestingSessionLocal() as db:
        assert (await ops.daily_kpi_digest(db)) == {"skipped": True}


@pytest.mark.asyncio
async def test_non_staff_on_staff_endpoint_alerts_security(
    client: AsyncClient, outbox, auth_headers
):
    res = await client.get("/api/v1/admin/stats", headers=auth_headers)
    assert res.status_code == 403
    await slack.drain()
    assert any(
        b["channel"] == "C_SEC" and "Non-staff" in b["text"] for k, b in outbox if k == "post"
    )


@pytest.mark.asyncio
async def test_dispatch_falls_back_in_process(monkeypatch, outbox):
    monkeypatch.undo()  # restore the real dispatch, keep nothing else patched here
    monkeypatch.setattr(settings, "SLACK_SIGNING_SECRET", SECRET)
    called: list[dict] = []

    async def fake_run(**kwargs):
        called.append(kwargs)
        return {}

    def broken(_kwargs):
        raise ConnectionError("broker down")

    monkeypatch.setattr(service, "_send_to_celery", broken)
    monkeypatch.setattr(service, "run", fake_run)
    await service.dispatch(
        slack_user_id="U1", team_id="T1", text="status", response_url=RESPONSE_URL
    )
    await service.drain()
    assert called
    assert called[0]["text"] == "status"


def test_docs_list_every_command():
    from pathlib import Path

    parents = Path(__file__).resolve().parents
    if len(parents) < 4 or not (parents[3] / "docs" / "operations" / "slack.md").exists():
        pytest.skip("docs/ is not available (API-only test container)")
    doc = (parents[3] / "docs" / "operations" / "slack.md").read_text()
    for name, cmd in commands.REGISTRY.items():
        if name == cmd.name:
            assert f"`/rap {name}" in doc, name


def test_alert_buttons_have_unique_action_ids():
    """Slack rejects a whole message (invalid_blocks) when buttons share an action_id."""
    from app.services import slack as slack_service

    blocks = slack_service.alert_buttons(
        slack_service.button("Run now", "rap_alert", "cmd:sources run X"),
        slack_service.button("Pause source", "rap_alert", "cmd:sources pause X"),
    )
    ids = [e["action_id"] for e in blocks[0]["elements"]]
    assert len(ids) == len(set(ids)) == 3
    assert all(i.startswith("rap_alert") for i in ids)
