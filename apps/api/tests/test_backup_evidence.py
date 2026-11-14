"""Backup/restore evidence reporting and the service catalogue."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from auth_support import token_for
from conftest import TestingSessionLocal
from httpx import AsyncClient

from app.core.config import settings
from app.domains.auth.models import User, UserRole

SHA = "a" * 64


async def _staff() -> dict[str, str]:
    async with TestingSessionLocal() as db:
        u = User(
            email=f"ops-{uuid.uuid4().hex[:6]}@example.com", full_name="Ops", role=UserRole.ADMIN
        )
        db.add(u)
        await db.flush()
        t = token_for(u)
        await db.commit()
        return {"Authorization": f"Bearer {t}"}


def _report(kind: str, when: datetime, **extra) -> dict:
    return {
        "kind": kind,
        "status": "success",
        "environment": settings.APP_ENV,
        "finished_at": when.isoformat(),
        **extra,
    }


@pytest.mark.asyncio
async def test_report_requires_the_token_and_drives_freshness(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "BACKUP_REPORT_TOKEN", "t0ken-for-tests")
    staff = await _staff()
    url = "/api/v1/ops/backups/report"
    now = datetime.now(UTC)
    body = _report(
        "backup", now, archive_name="remote-ai-platform-x.tar.enc", sha256=SHA, tables=40
    )

    assert (await client.post(url, json=body)).status_code == 401
    assert (
        await client.post(url, json=body, headers={"X-Backup-Report-Token": "wrong"})
    ).status_code == 401
    bad = {**body, "archive_name": "../../etc/passwd"}
    assert (
        await client.post(url, json=bad, headers={"X-Backup-Report-Token": "t0ken-for-tests"})
    ).status_code == 422

    summary = (await client.get("/api/v1/admin/backups", headers=staff)).json()["summary"]
    assert summary["status"] == "no_evidence"

    stale = _report("backup", now - timedelta(hours=30))
    assert (
        await client.post(url, json=stale, headers={"X-Backup-Report-Token": "t0ken-for-tests"})
    ).status_code == 201
    assert (await client.get("/api/v1/admin/backups", headers=staff)).json()["summary"][
        "status"
    ] == "backup_stale"

    assert (
        await client.post(url, json=body, headers={"X-Backup-Report-Token": "t0ken-for-tests"})
    ).status_code == 201
    assert (await client.get("/api/v1/admin/backups", headers=staff)).json()["summary"][
        "status"
    ] == "restore_unverified"

    restore = _report("restore_verify", now, target_label="scratch db")
    assert (
        await client.post(url, json=restore, headers={"X-Backup-Report-Token": "t0ken-for-tests"})
    ).status_code == 201
    data = (await client.get("/api/v1/admin/backups", headers=staff)).json()
    assert data["summary"]["status"] == "ok"
    assert data["summary"]["last_restore_target"] == "scratch db"
    assert len(data["runs"]) == 3
    inv = (await client.get("/api/v1/admin/operations/inventory", headers=staff)).json()
    assert inv["backup"]["status"] == "ok"


@pytest.mark.asyncio
async def test_report_disabled_without_configured_token(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "BACKUP_REPORT_TOKEN", "")
    r = await client.post(
        "/api/v1/ops/backups/report",
        json=_report("backup", datetime.now(UTC)),
        headers={"X-Backup-Report-Token": ""},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_catalogue_lists_components_for_staff_only(client: AsyncClient, engineer_token: str):
    member = {"Authorization": f"Bearer {engineer_token}"}
    assert (await client.get("/api/v1/admin/catalogue", headers=member)).status_code == 403
    data = (await client.get("/api/v1/admin/catalogue", headers=await _staff())).json()
    ids = {c["id"] for c in data["components"]}
    assert {"api", "worker", "database", "storage", "push"} <= ids
    for c in data["components"]:
        assert c["status"]
        assert c["runbook"]
        assert "check" not in c
    assert data["backup"]["status"] in {"no_evidence", "ok", "backup_stale", "restore_unverified"}
