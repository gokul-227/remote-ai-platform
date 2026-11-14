"""Durable background processing: run lifecycle, idempotency, retries, dead letters,
outbox dispatch, import scheduling, heartbeats and the staff endpoints."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from auth_support import token_for
from conftest import TestingSessionLocal
from httpx import AsyncClient

from app.domains.auth.models import User, UserRole
from app.domains.tasks.models import (
    TASK_DEAD,
    TASK_QUEUED,
    TASK_RETRYING,
    TASK_SUCCEEDED,
    DeadLetter,
    JobSource,
    TaskRun,
)
from app.domains.tasks.service import TASK_IMPORT_SOURCE, TaskService


class Recorder:
    def __init__(self) -> None:
        self.sent: list[tuple[str, uuid.UUID, dict, datetime | None]] = []

    def __call__(self, task_name, run_id, args, eta) -> None:  # noqa: ANN001
        self.sent.append((task_name, run_id, args, eta))


@pytest.fixture
def recorder() -> Recorder:
    return Recorder()


@pytest.mark.asyncio
async def test_enqueue_is_idempotent_until_terminal(recorder: Recorder):
    async with TestingSessionLocal() as db:
        service = TaskService(db, dispatcher=recorder)
        run, created = await service.enqueue("demo.task", {"a": 1}, idempotency_key="k1")
        assert created
        assert run.status == TASK_QUEUED
        again, created_again = await service.enqueue("demo.task", {"a": 1}, idempotency_key="k1")
        assert not created_again
        assert again.id == run.id
        assert len(recorder.sent) == 1
        assert recorder.sent[0][1] == run.id
        await service.mark_started(run.id, "w1")
        await service.mark_succeeded(run.id, {"ok": True})
        third, created_third = await service.enqueue("demo.task", {"a": 1}, idempotency_key="k1")
        assert created_third
        assert third.id != run.id
        old = await db.get(TaskRun, run.id)
        assert old is not None
        assert old.status == TASK_SUCCEEDED
        assert old.idempotency_key != "k1"


@pytest.mark.asyncio
async def test_failures_retry_with_backoff_then_dead_letter(recorder: Recorder):
    async with TestingSessionLocal() as db:
        service = TaskService(db, dispatcher=recorder)
        run, _ = await service.enqueue("demo.flaky", {}, idempotency_key="flaky", max_attempts=2)
        await service.mark_started(run.id, "w1")
        status, next_retry = await service.mark_failed(run.id, "boom")
        assert status == TASK_RETRYING
        assert next_retry is not None
        assert next_retry > datetime.now(UTC) + timedelta(seconds=30)
        await service.mark_started(run.id, "w1")
        status, next_retry = await service.mark_failed(run.id, "boom again")
        assert status == TASK_DEAD
        assert next_retry is None
        dead = (await db.execute(DeadLetter.__table__.select())).first()
        assert dead is not None
        assert dead.task_run_id == run.id
        # Retrying a dead letter creates a fresh run and marks the letter.
        dead_id = dead.id
        new_run = await service.retry_dead_letter(dead_id)
        assert new_run is not None
        assert new_run.id != run.id
        assert new_run.status == TASK_QUEUED
        assert await service.retry_dead_letter(dead_id) is None


@pytest.mark.asyncio
async def test_stale_started_run_is_requeued_and_counts_the_lost_attempt(recorder: Recorder):
    async with TestingSessionLocal() as db:
        service = TaskService(db, dispatcher=recorder)
        run, _ = await service.enqueue("demo.lost", {}, idempotency_key="lost", max_attempts=3)
        await service.mark_started(run.id, "w-dead")
        run.updated_at = datetime.now(UTC) - timedelta(hours=2)
        await db.commit()
        requeued = await service.requeue_stale(timedelta(minutes=30))
        assert requeued == 1
        refreshed = await db.get(TaskRun, run.id)
        assert refreshed is not None
        assert refreshed.status == TASK_QUEUED
        assert refreshed.error == "worker lost"
        assert len(recorder.sent) == 2  # original + requeue


@pytest.mark.asyncio
async def test_outbox_events_become_runs_exactly_once(recorder: Recorder):
    async with TestingSessionLocal() as db:
        service = TaskService(db, dispatcher=recorder)
        await service.emit("email.enqueued", "email_outbox", "abc", {"n": 1})
        await service.emit("something.unknown", "thing", "xyz", {})
        await db.commit()
        assert await service.dispatch_outbox() == 2
        assert await service.dispatch_outbox() == 0
        names = sorted(t for t, *_ in recorder.sent)
        assert names == ["notifications.flush_email_outbox", "outbox.handle_event"]


@pytest.mark.asyncio
async def test_due_sources_enqueue_once_per_cron_slot(recorder: Recorder):
    async with TestingSessionLocal() as db:
        service = TaskService(db, dispatcher=recorder)
        await service.ensure_sources(["ALPHA", "BETA", "REMOTIVE"])
        beta = await db.get(JobSource, "BETA")
        assert beta is not None
        beta.permission_confirmed = False
        remotive = await db.get(JobSource, "REMOTIVE")
        assert remotive is not None
        assert remotive.cron == "0 */6 * * *"
        await db.commit()
        now = datetime(2026, 11, 14, 3, 30, tzinfo=UTC)
        runs = await service.due_sources(now)
        assert sorted(r.args["source"] for r in runs) == ["ALPHA", "REMOTIVE"]
        assert all(r.task_name == TASK_IMPORT_SOURCE for r in runs)
        # Same slot, a minute later: nothing new.
        assert await service.due_sources(now + timedelta(minutes=1)) == []
        # 06:10: REMOTIVE's 06:00 slot has passed; ALPHA's next slot (06:17) has not.
        later = datetime(2026, 11, 14, 6, 10, tzinfo=UTC)
        assert [r.args["source"] for r in await service.due_sources(later)] == ["REMOTIVE"]


@pytest.mark.asyncio
async def test_heartbeats_report_liveness(recorder: Recorder):
    async with TestingSessionLocal() as db:
        service = TaskService(db, dispatcher=recorder)
        await service.heartbeat("worker:a", "worker", ["default"], active_runs=1)
        live = await service.liveness(timedelta(seconds=60))
        assert live["worker"]["count"] == 1
        assert live["worker"]["fresh"] == 1
        assert "scheduler" not in live


@pytest.mark.asyncio
async def test_import_task_lifecycle_records_run_and_checkpoint(monkeypatch, recorder: Recorder):
    """The async body of the Celery import task, driven without a broker."""
    from app.domains.jobs import service as jobs_service
    from app.worker import runtime, tasks

    monkeypatch.setattr(runtime, "session_factory", lambda: TestingSessionLocal)

    async def fake_sync(self, **kwargs):  # noqa: ANN001
        return {kwargs["source_name"]: 7}

    monkeypatch.setattr(jobs_service.JobService, "sync_all_job_sources", fake_sync)
    async with TestingSessionLocal() as db:
        run, _ = await TaskService(db, dispatcher=recorder).enqueue(
            TASK_IMPORT_SOURCE, {"source": "ALPHA", "limit": 5}, idempotency_key="imp"
        )
    result = await tasks.import_source_async(run.id, "ALPHA", 5)
    assert result == {"source": "ALPHA", "saved": 7}
    async with TestingSessionLocal() as db:
        saved = await db.get(TaskRun, run.id)
        assert saved is not None
        assert saved.status == TASK_SUCCEEDED
        assert saved.attempts == 1
        from app.domains.tasks.models import JobImportCheckpoint

        cp = await db.get(JobImportCheckpoint, "ALPHA")
        assert cp is not None
        assert cp.last_success_at is not None
        assert cp.consecutive_failures == 0

    async def failing_sync(self, **kwargs):  # noqa: ANN001
        raise RuntimeError("provider down")

    monkeypatch.setattr(jobs_service.JobService, "sync_all_job_sources", failing_sync)
    async with TestingSessionLocal() as db:
        run2, _ = await TaskService(db, dispatcher=recorder).enqueue(
            TASK_IMPORT_SOURCE, {"source": "ALPHA"}, idempotency_key="imp2", max_attempts=1
        )
    result = await tasks.import_source_async(run2.id, "ALPHA")
    assert result["status"] == TASK_DEAD
    async with TestingSessionLocal() as db:
        from app.domains.tasks.models import JobImportCheckpoint

        cp = await db.get(JobImportCheckpoint, "ALPHA")
        assert cp is not None
        assert cp.consecutive_failures == 1
        assert "RuntimeError" in (cp.last_error or "")


async def _staff_headers() -> dict[str, str]:
    async with TestingSessionLocal() as db:
        admin = User(
            email=f"ops-{uuid.uuid4().hex[:6]}@example.com", full_name="Ops", role=UserRole.ADMIN
        )
        db.add(admin)
        await db.flush()
        token = token_for(admin)
        await db.commit()
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_background_endpoints_require_staff_and_audit_changes(
    client: AsyncClient, engineer_token: str, monkeypatch
):
    from app.core.config import settings

    monkeypatch.setattr(settings, "TASKS_DISPATCH_DISABLED", True)
    member = {"Authorization": f"Bearer {engineer_token}"}
    assert (
        await client.get("/api/v1/admin/background/overview", headers=member)
    ).status_code == 403
    staff = await _staff_headers()
    overview = await client.get("/api/v1/admin/background/overview", headers=staff)
    assert overview.status_code == 200
    assert overview.json()["dispatch_disabled"] is True

    sources = await client.get("/api/v1/admin/background/sources", headers=staff)
    assert sources.status_code == 200
    names = [s["name"] for s in sources.json()]
    assert "GREENHOUSE" in names
    assert "REMOTIVE" in names

    bad = await client.patch(
        "/api/v1/admin/background/sources/GREENHOUSE",
        headers=staff,
        json={"reason": "test", "cron": "not a cron"},
    )
    assert bad.status_code == 422
    no_reason = await client.patch(
        "/api/v1/admin/background/sources/GREENHOUSE", headers=staff, json={"enabled": False}
    )
    assert no_reason.status_code == 422
    patched = await client.patch(
        "/api/v1/admin/background/sources/GREENHOUSE",
        headers=staff,
        json={
            "reason": "provider asked for fewer calls",
            "cron": "0 */6 * * *",
            "permission_confirmed": False,
        },
    )
    assert patched.status_code == 200
    assert patched.json()["cron"] == "0 */6 * * *"

    blocked = await client.post(
        "/api/v1/admin/background/sources/GREENHOUSE/run", headers=staff, json={"reason": "manual"}
    )
    assert blocked.status_code == 409
    ok = await client.post(
        "/api/v1/admin/background/sources/REMOTIVE/run", headers=staff, json={"reason": "manual"}
    )
    assert ok.status_code == 202
    run_id = ok.json()["id"]
    runs = await client.get("/api/v1/admin/background/runs?status=queued", headers=staff)
    assert run_id in [r["id"] for r in runs.json()]

    audit = await client.get("/api/v1/admin/audit-events?limit=50", headers=staff)
    actions = {e["action"] for e in audit.json()}
    assert {"background.source.update", "background.source.manual_import"} <= actions


@pytest.mark.asyncio
async def test_readiness_reports_worker_liveness(client: AsyncClient):
    async with TestingSessionLocal() as db:
        await TaskService(db, dispatcher=lambda *a: None).heartbeat(
            "worker:x", "worker", ["default"]
        )
    ready = await client.get("/health/ready")
    assert ready.status_code == 200
    services = ready.json()["services"]
    assert services["worker"]["status"] == "HEALTHY"
    assert services["scheduler"]["status"] == "UNKNOWN"
