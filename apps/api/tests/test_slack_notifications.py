"""Slack notifier and its hooks. Slack is faked with httpx.MockTransport."""

import json
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from conftest import TestingSessionLocal
from httpx import AsyncClient

from app.core.config import settings
from app.services import slack
from app.worker import ops

CHANNEL_IDS = {
    "SLACK_CHANNEL_ALERTS_CRITICAL": "C_CRIT",
    "SLACK_CHANNEL_ALERTS_ERRORS": "C_ERR",
    "SLACK_CHANNEL_DEPLOYS": "C_DEP",
    "SLACK_CHANNEL_BACKUPS": "C_BAK",
    "SLACK_CHANNEL_JOB_IMPORTS": "C_JOB",
    "SLACK_CHANNEL_SIGNUPS": "C_SIGN",
    "SLACK_CHANNEL_SECURITY": "C_SEC",
    "SLACK_CHANNEL_COSTS": "C_COST",
}


@pytest.fixture
def sent(monkeypatch):
    """Enable Slack with a fake API; yields the list of posted (channel, text)."""

    class Posts(list):
        status: dict

    posts = Posts()
    status = {"code": 200, "ok": True}

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == slack.POST_URL
        assert request.headers["authorization"] == "Bearer xoxb-test"
        body = json.loads(request.content)
        posts.append((body["channel"], body["text"]))
        return httpx.Response(status["code"], json={"ok": status["ok"]})

    monkeypatch.setattr(settings, "SLACK_BOT_TOKEN", "xoxb-test")
    for k, v in CHANNEL_IDS.items():
        monkeypatch.setattr(settings, k, v)
    monkeypatch.setattr(slack, "_transport", httpx.MockTransport(handler))
    slack.reset()
    posts.status = status
    yield posts
    slack.reset()


def channels(posts, cid):
    return [t for c, t in posts if c == cid]


@pytest.mark.asyncio
async def test_disabled_without_token_or_channel(monkeypatch):
    monkeypatch.setattr(settings, "SLACK_BOT_TOKEN", "")
    assert not slack.enabled()
    assert await slack.post("critical", "x") is False
    slack.notify("critical", "x")  # no-op, no loop task
    monkeypatch.setattr(settings, "SLACK_BOT_TOKEN", "t")
    monkeypatch.setattr(settings, "SLACK_CHANNEL_COSTS", "")
    assert await slack.post("costs", "x") is False
    assert await slack.post("nope", "x") is False


@pytest.mark.asyncio
async def test_post_dedup_rate_limit_and_failures(sent, monkeypatch):
    assert await slack.post("critical", "one", dedup_key="k", fields={"a": 1, "b": None})
    assert await slack.post("critical", "one again", dedup_key="k") is False
    assert "• *a*: 1" in sent[0][1] and "*b*" not in sent[0][1]
    assert sent[0][1].startswith("[development] ")
    monkeypatch.setattr(settings, "SLACK_MAX_PER_MINUTE", 2)
    assert await slack.post("critical", "two")
    assert await slack.post("critical", "three") is False  # 2 per minute
    assert await slack.post("costs", "other channel") is True
    sent.status.update(ok=False)
    assert await slack.post("security", "rejected") is False

    def boom(request):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(slack, "_transport", httpx.MockTransport(boom))
    assert await slack.post("signups", "network down") is False


@pytest.mark.asyncio
async def test_notify_runs_in_background_and_drains(sent):
    slack.notify("deploys", "hello")
    await slack.drain()
    assert channels(sent, "C_DEP") == ["[development] hello"]


@pytest.mark.asyncio
async def test_audit_hook_routes_security_and_incidents(sent, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_URL", "https://admin.example.com")
    slack.audit_hook("admin.user.role", "user", "u1", None, {"role": "ADMIN", "token": "x"})
    slack.audit_hook("feature_flag.update", "flag", "f", uuid.uuid4(), {"enabled": True})
    slack.audit_hook("support.ticket.update", "ticket", "t", None, {})  # not routed
    slack.audit_hook("admin.incident.create", "incident", "i1", None, {"severity": "SEV1"})
    slack.audit_hook(
        "admin.incident.update", "incident", "i1", None, {"after": {"status": "RESOLVED"}}
    )
    slack.audit_hook(
        "admin.incident.update", "incident", "i1", None, {"after": {"severity": "SEV2"}}
    )
    await slack.drain()
    sec = channels(sent, "C_SEC")
    assert len(sec) == 2 and "Member role changed" in sec[0] and "token" not in sec[0]
    crit = channels(sent, "C_CRIT")
    assert len(crit) == 2
    assert "Incident opened (SEV1)" in crit[0] and "admin.example.com" in crit[0]
    assert "Incident resolved" in crit[1]


@pytest.mark.asyncio
async def test_record_audit_event_calls_the_hook(sent):
    from app.core.audit import record_audit_event

    async with TestingSessionLocal() as db:
        await record_audit_event(db, "staff.roles.update", "user", "u2", payload={"roles": ["x"]})
        await db.commit()
    await slack.drain()
    assert "Staff roles changed" in channels(sent, "C_SEC")[0]


@pytest.mark.asyncio
async def test_backup_report_posts(sent, client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "BACKUP_REPORT_TOKEN", "tok")
    h = {"X-Backup-Report-Token": "tok"}
    now = datetime.now(UTC).isoformat()
    ok = {
        "kind": "backup",
        "environment": "prod",
        "status": "success",
        "finished_at": now,
        "size_bytes": 2_097_152,
        "tables": 3,
    }
    assert (await client.post("/api/v1/ops/backups/report", json=ok, headers=h)).status_code == 201
    bad = {**ok, "status": "failed", "error": "disk full"}
    assert (await client.post("/api/v1/ops/backups/report", json=bad, headers=h)).status_code == 201
    await slack.drain()
    bak = channels(sent, "C_BAK")
    assert "Backup success" in bak[0] and "size_mb*: 2.0" in bak[0]
    assert any("failed" in t for t in bak)
    assert "disk full" in channels(sent, "C_CRIT")[0]


@pytest.mark.asyncio
async def test_uptime_hook_requires_token_and_relays(sent, client: AsyncClient, monkeypatch):
    url = "/api/v1/ops/uptime-hook"
    monkeypatch.setattr(settings, "UPTIME_HOOK_TOKEN", "")
    assert (await client.post(url + "?token=x")).status_code == 401
    monkeypatch.setattr(settings, "UPTIME_HOOK_TOKEN", "hooktok")
    assert (await client.post(url + "?token=bad")).status_code == 401
    res = await client.post(
        url + "?token=hooktok",
        json={
            "monitorFriendlyName": "API ready",
            "alertTypeFriendlyName": "Down",
            "monitorURL": "https://api.example.com/health/ready",
            "alertDetails": "timeout",
        },
    )
    assert res.status_code == 202 and res.json() == {"relayed": True}
    res = await client.post(
        url,
        data={"monitorFriendlyName": "Web", "alertTypeFriendlyName": "Up"},
        headers={"X-Uptime-Hook-Token": "hooktok"},
    )
    assert res.json() == {"relayed": True}
    crit = channels(sent, "C_CRIT")
    assert ":red_circle: External monitor: API ready is Down" in crit[0] and "timeout" in crit[0]
    assert ":large_green_circle:" in crit[1]


@pytest.mark.asyncio
async def test_signup_and_spike(sent, monkeypatch):
    from app.domains.auth.models import UserRole
    from app.domains.auth.repository import UserRepository
    from app.domains.auth.schemas import UserCreate

    monkeypatch.setattr(settings, "SLACK_SIGNUP_SPIKE_PER_HOUR", 1)
    async with TestingSessionLocal() as db:
        repo = UserRepository(db)
        for i in range(2):
            await repo.create(
                UserCreate(
                    auth_subject=str(uuid.uuid4()),
                    email=f"s{i}@corp.example",
                    full_name="M",
                    role=UserRole.ENGINEER,
                    is_active=True,
                )
            )
        await db.commit()
    await slack.drain()
    sign = channels(sent, "C_SIGN")
    assert sign.count("[development] :wave: New sign-up (@corp.example)") == 2
    assert any("spike" in t for t in sign)
    assert any("spike" in t for t in channels(sent, "C_SEC"))


@pytest.mark.asyncio
async def test_auth_failure_burst(sent, client: AsyncClient, monkeypatch):
    from app.domains.auth import dependencies

    monkeypatch.setattr(settings, "SLACK_AUTH_FAILURE_BURST", 3)
    dependencies._auth_failures.clear()
    for _ in range(3):
        r = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
        assert r.status_code == 401
    await slack.drain()
    assert any("rejected sign-in tokens" in t for t in channels(sent, "C_SEC"))
    dependencies._auth_failures.clear()


@pytest.mark.asyncio
async def test_identity_conflict_alert(sent):
    from app.domains.auth.service import _security_alert

    _security_alert("Sign-in refused", "u9")
    await slack.drain()
    assert "Sign-in refused" in channels(sent, "C_SEC")[0]


@pytest.mark.asyncio
async def test_health_degradation_alert(sent, client: AsyncClient):
    from app.core.health import ServiceCheckResult, _alert_degradations

    _alert_degradations(
        {
            "redis": ServiceCheckResult(
                service="Redis", status="DOWN", latency_ms=0, checked_at="", error="refused"
            ),
            "db": ServiceCheckResult(service="DB", status="HEALTHY", latency_ms=0, checked_at=""),
        }
    )
    await slack.drain()
    crit = channels(sent, "C_CRIT")
    assert len(crit) == 1 and "Redis is DOWN" in crit[0]
    await client.get("/health/ready")  # exercises the hook inside the endpoint
    await slack.drain()


@pytest.mark.asyncio
async def test_dead_letter_and_stale_heartbeat(sent):
    from app.domains.tasks.models import WorkerHeartbeat
    from app.domains.tasks.service import TaskService

    async with TestingSessionLocal() as db:
        svc = TaskService(db, dispatcher=lambda *a: None)
        run, _ = await svc.enqueue("x.task", {"a": 1}, max_attempts=1)
        await svc.mark_started(run.id, "w")
        await svc.mark_failed(run.id, "boom")
        db.add(
            WorkerHeartbeat(
                worker_id="worker:old",
                kind="worker",
                queues=[],
                active_runs=0,
                hostname="h",
                last_seen_at=datetime.now(UTC) - timedelta(hours=1),
            )
        )
        await db.commit()
        assert (await ops.check_liveness(db))["stale"] == ["worker"]
    crit = channels(sent, "C_CRIT")
    assert "dead letters: x.task" in crit[0] and "boom" in crit[0]
    assert "No fresh worker heartbeat" in crit[1]


@pytest.mark.asyncio
async def test_daily_import_summary_and_backup_check(sent):
    from app.domains.tasks.models import JobImportCheckpoint, TaskRun

    async with TestingSessionLocal() as db:
        db.add(
            TaskRun(
                task_name="jobs.import_source",
                idempotency_key="s1",
                args={},
                status="SUCCEEDED",
                max_attempts=1,
                result={"saved": 7},
            )
        )
        db.add(
            JobImportCheckpoint(
                source="REMOTIVE", cursor={}, consecutive_failures=2, last_error="HTTP 500"
            )
        )
        await db.commit()
        out = await ops.daily_import_summary(db)
        assert out["saved"] == 7 and out["failing"] == 1
        assert (await ops.check_backups(db))["status"] == "no_evidence"
    job = channels(sent, "C_JOB")[0]
    assert "succeeded 1" in job and "7 jobs saved" in job and "REMOTIVE (2x" in job
    assert "No successful backup" in channels(sent, "C_BAK")[0]
    assert "No successful backup" in channels(sent, "C_CRIT")[0]


@pytest.mark.asyncio
async def test_cost_guard_thresholds(sent, monkeypatch):
    monkeypatch.setattr(settings, "COST_EMAIL_DAILY_LIMIT", 0)  # skipped (no limit)
    monkeypatch.setattr(settings, "AI_GLOBAL_DAILY_TOKENS", 100)
    monkeypatch.setattr(ops, "_bucket_bytes", lambda: {"files": 19 * 1_073_741_824})
    from app.services.ai.models import AIUsageLog

    async with TestingSessionLocal() as db:
        db.add(AIUsageLog(total_tokens=75, prompt_tokens=50, completion_tokens=25))
        await db.commit()
        out = await ops.cost_guard(db)
        assert "vm_disk" in out["metrics"]
        assert set(out["alerts"]) >= {"object_storage", "ai_tokens_today"}
        again = await ops.cost_guard(db)  # same day/level: deduplicated
        assert again["alerts"] == out["alerts"]
    cost = channels(sent, "C_COST")
    assert sum("object storage at 95%" in t for t in cost) == 1
    assert any(":warning: ai tokens today at 75%" in t for t in cost)


def test_bucket_bytes_without_keys(monkeypatch):
    monkeypatch.setattr(settings, "OCI_S3_ACCESS_KEY_ID", "")
    assert ops._bucket_bytes() == {}


def test_bucket_bytes_sums_pages(monkeypatch):
    import boto3

    class Pager:
        def paginate(self, Bucket):  # noqa: N803
            return [{"Contents": [{"Size": 5}, {"Size": 6}]}, {}]

    class Fake:
        def list_buckets(self):
            return {"Buckets": [{"Name": "a"}]}

        def get_paginator(self, name):
            return Pager()

    monkeypatch.setattr(settings, "OCI_S3_ACCESS_KEY_ID", "k")
    monkeypatch.setattr(settings, "OCI_S3_SECRET_ACCESS_KEY", "s")
    monkeypatch.setattr(settings, "COST_BUCKETS", "")
    monkeypatch.setattr(boto3, "client", lambda *a, **k: Fake())
    assert ops._bucket_bytes() == {"a": 11}
