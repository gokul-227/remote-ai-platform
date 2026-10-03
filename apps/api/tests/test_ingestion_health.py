"""OBS-03: ingestion health is per source, so one dead source is visible even
while the others keep the newest posting fresh."""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient


async def _log(source: str, status: str, hours_ago: float, fetched: int = 10):
    from conftest import TestingSessionLocal

    from app.domains.admin.models import ApiSyncLog

    async with TestingSessionLocal() as db:
        db.add(ApiSyncLog(source=source, status=status, jobs_fetched=fetched, jobs_inserted=0, jobs_updated=0,
                          created_at=datetime.now(UTC) - timedelta(hours=hours_ago)))
        await db.commit()


@pytest.mark.asyncio
async def test_reports_last_success_and_failures_since_per_source(client: AsyncClient):
    await _log("OBS_A", "SUCCESS", 30, fetched=7)
    await _log("OBS_A", "FAILED", 18)
    await _log("OBS_A", "FAILED", 12)
    await _log("OBS_B", "FAILED", 40)
    await _log("OBS_B", "SUCCESS", 2, fetched=25)

    body = (await client.get("/health/ingestion")).json()
    a, b = body["sources"]["OBS_A"], body["sources"]["OBS_B"]
    assert a["failures_since_success"] == 2 and a["last_success_fetched"] == 7
    assert 29 < a["hours_since_success"] < 31
    assert b["failures_since_success"] == 0 and b["last_success_fetched"] == 25 and b["hours_since_success"] < 3


@pytest.mark.asyncio
async def test_never_successful_source_and_overdue_erasures(client: AsyncClient):
    from conftest import TestingSessionLocal

    from app.domains.auth.models import DeletedIdentity

    await _log("OBS_NEVER", "FAILED", 1)
    async with TestingSessionLocal() as db:
        db.add(DeletedIdentity(subject_hash="b" * 64, deleted_at=datetime.now(UTC) - timedelta(hours=30),
                               pending_subject="11111111-1111-1111-1111-111111111111"))
        db.add(DeletedIdentity(subject_hash="c" * 64, deleted_at=datetime.now(UTC) - timedelta(hours=1),
                               pending_subject="22222222-2222-2222-2222-222222222222"))
        await db.commit()
    body = (await client.get("/health/ingestion")).json()
    assert body["sources"]["OBS_NEVER"]["last_success_at"] is None
    assert body["identity_erasures_overdue"] == 1
    # Never exposes subjects or hashes.
    # Match the full values: a short fragment like "1111" can occur in a timestamp.
    text = str(body)
    assert "11111111-1111-1111-1111-111111111111" not in text
    assert "b" * 64 not in text


@pytest.mark.asyncio
async def test_every_configured_source_is_listed_even_without_logs(client: AsyncClient):
    """OBS-01: a configured source that never ran is reported, not absent."""
    from app.domains.jobs.service import AGGREGATORS

    body = (await client.get("/health/ingestion")).json()
    for cls in AGGREGATORS:
        entry = body["sources"][cls.source_name]
        assert entry["configured"] is True
        assert "last_success_at" in entry and "last_status" in entry


@pytest.mark.asyncio
async def test_success_older_than_window_is_still_reported(client: AsyncClient):
    """OBS-01: 15 days of silence must show a 360 h old success, not a null that
    the canary used to skip."""
    await _log("ARBEITNOW", "SUCCESS", 24 * 15, fetched=3)
    await _log("ARBEITNOW", "FAILED", 2)
    entry = (await client.get("/health/ingestion")).json()["sources"]["ARBEITNOW"]
    assert entry["hours_since_success"] > 24 * 14
    assert entry["last_status"] == "FAILED" and entry["failures_since_success"] == 1


@pytest.mark.asyncio
async def test_disabled_runs_are_not_failures(client: AsyncClient):
    await _log("OBS_DISABLED", "DISABLED", 1, fetched=0)
    entry = (await client.get("/health/ingestion")).json()["sources"]["OBS_DISABLED"]
    assert entry["last_status"] == "DISABLED" and entry["failures_since_success"] == 0
