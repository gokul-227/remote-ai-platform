"""PERF-01: the public job list is the same for every visitor, so repeated
identical requests are served from a short in-process cache; any change to a
job empties it."""

import uuid

import pytest
from httpx import AsyncClient


@pytest.fixture(autouse=True)
def _fresh_cache():
    from app.domains.jobs import list_cache

    list_cache.clear()
    yield
    list_cache.clear()


async def _add_job(title: str):
    from conftest import TestingSessionLocal

    from app.domains.jobs.models import JobPost

    async with TestingSessionLocal() as db:
        db.add(JobPost(title=title, slug=f"s-{uuid.uuid4().hex[:8]}", description="d", company_name="Acme",
                       is_remote=True, skills=[], source="REMOTEOK"))
        await db.commit()


@pytest.mark.asyncio
async def test_repeated_requests_are_served_from_cache_and_writes_invalidate(client: AsyncClient, monkeypatch):
    from app.domains.jobs import list_cache
    from app.domains.jobs.service import JobService

    calls = 0
    real = JobService.search_jobs

    async def counting(self, *a, **kw):
        nonlocal calls
        calls += 1
        return await real(self, *a, **kw)

    monkeypatch.setattr(JobService, "search_jobs", counting)
    first = await client.get("/api/v1/jobs", params={"limit": 5})
    second = await client.get("/api/v1/jobs", params={"limit": 5})
    assert first.json() == second.json() and first.headers["X-Total-Count"] == second.headers["X-Total-Count"]
    assert calls == 1

    await client.get("/api/v1/jobs", params={"limit": 6})  # different query, different entry
    assert calls == 2

    await _add_job("Freshly posted role")
    third = await client.get("/api/v1/jobs", params={"limit": 5})
    assert calls == 3
    assert int(third.headers["X-Total-Count"]) == int(first.headers["X-Total-Count"]) + 1
    assert len(list_cache._entries) <= list_cache.MAX_ENTRIES


def test_cache_is_bounded():
    from app.domains.jobs import list_cache

    for i in range(list_cache.MAX_ENTRIES + 50):
        list_cache.put(("k", i), ([], 0))
    assert len(list_cache._entries) == list_cache.MAX_ENTRIES


@pytest.mark.asyncio
async def test_bulk_job_updates_also_invalidate(client: AsyncClient):
    """Expiring unseen jobs is a bulk UPDATE, which skips flush events."""
    from conftest import TestingSessionLocal

    from app.domains.jobs import list_cache
    from app.domains.jobs.repository import JobRepository

    list_cache.put("some-page", ([], 0))
    async with TestingSessionLocal() as db:
        await JobRepository(db).expire_unseen_jobs("REMOTEOK")
        await db.commit()
    assert list_cache.get("some-page") is None


@pytest.mark.asyncio
async def test_a_moderated_job_disappears_from_every_public_api_view_at_once(client: AsyncClient):
    """CACHE-01: hiding a job must not wait for the list cache to expire.

    Production runs one uvicorn worker (render.yaml WEB_CONCURRENCY=1), so the
    process that hides the job is the one whose cache is emptied. With more
    workers, other processes would serve the job for up to TTL_SECONDS."""
    from auth_support import mint_token
    from conftest import TestingSessionLocal
    from sqlalchemy import select

    from app.domains.auth.models import User, UserRole
    from app.domains.jobs.models import JobPost

    title = f"Moderate me {uuid.uuid4().hex[:6]}"
    await _add_job(title)
    params = {"limit": 100, "query": title}
    listed = await client.get("/api/v1/jobs", params=params)
    assert [j["title"] for j in listed.json()] == [title]  # cache primed
    async with TestingSessionLocal() as db:
        job_id = (await db.scalar(select(JobPost).where(JobPost.title == title))).id

    sub = str(uuid.uuid4())
    admin = {"Authorization": f"Bearer {mint_token(sub, f'mod-{sub[:6]}@example.com')}"}
    assert (await client.get("/api/v1/auth/me", headers=admin)).status_code == 200
    async with TestingSessionLocal() as db:
        (await db.scalar(select(User).where(User.auth_subject == sub))).role = UserRole.ADMIN
        await db.commit()

    hide = await client.patch(f"/api/v1/admin/jobs/{job_id}/status", headers=admin, json={"is_active": False})
    assert hide.status_code == 200
    assert (await client.get("/api/v1/jobs", params=params)).json() == []
    assert (await client.get(f"/api/v1/jobs/{job_id}")).status_code == 404


def test_production_keeps_one_api_worker_so_moderation_is_immediate():
    from pathlib import Path

    parents = Path(__file__).resolve().parents
    render = (parents[3] if len(parents) > 3 else parents[-1]) / "infra" / "deploy" / "render.yaml"
    if not render.exists():
        pytest.skip("infra/ not in this build context")
    text = render.read_text()
    assert 'key: WEB_CONCURRENCY\n        value: "1"' in text, (
        "More than one worker makes hidden jobs reappear for up to list_cache.TTL_SECONDS; "
        "share the cache (Redis) or invalidate across workers first (CACHE-01)."
    )
