"""Phase 14: the scheduled job sync uses a credential that can do nothing
else, instead of logging in as a full administrator."""

import pytest
from httpx import AsyncClient

from app.core.config import settings

URL = "/api/v1/jobs/sync/scheduled"


@pytest.fixture
def fake_sync(monkeypatch):
    from app.domains.jobs.service import JobService

    calls = []

    async def fake(self, limit_per_source=50, admin_repo=None, source_name=None):
        calls.append(limit_per_source)
        return {"REMOTEOK": 3}

    monkeypatch.setattr(JobService, "sync_all_job_sources", fake)
    return calls


@pytest.mark.asyncio
async def test_disabled_without_a_configured_token(client: AsyncClient, monkeypatch, fake_sync):
    monkeypatch.setattr(settings, "JOB_SYNC_TOKEN", "")
    assert (await client.post(URL, headers={"X-Job-Sync-Token": ""})).status_code == 404
    assert fake_sync == []


@pytest.mark.asyncio
async def test_wrong_or_missing_token_is_refused(client: AsyncClient, monkeypatch, fake_sync):
    monkeypatch.setattr(settings, "JOB_SYNC_TOKEN", "s" * 40)
    assert (await client.post(URL)).status_code == 403
    assert (await client.post(URL, headers={"X-Job-Sync-Token": "t" * 40})).status_code == 403
    assert fake_sync == []


@pytest.mark.asyncio
async def test_right_token_runs_the_sync_and_nothing_else(client: AsyncClient, monkeypatch, fake_sync):
    monkeypatch.setattr(settings, "JOB_SYNC_TOKEN", "s" * 40)
    resp = await client.post(URL, headers={"X-Job-Sync-Token": "s" * 40})
    assert resp.status_code == 200 and resp.json() == {"REMOTEOK": 3, "identity_erasures_pending": 0}
    # The token is not a user credential: admin endpoints still need a user.
    assert (await client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {'s' * 40}"})).status_code == 401
