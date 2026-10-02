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
    assert "1111" not in str(body) and "bbbb" not in str(body)
