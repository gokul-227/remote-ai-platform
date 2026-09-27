"""True concurrency on PostgreSQL (the SQLite unit-test harness shares one
connection and cannot prove it). Skipped unless TEST_POSTGRES_URL points at a
disposable, migrated database, as in CI's migration job.

Each request runs in its own session and transaction, as in production.
"""

import asyncio
import os
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

URL = os.environ.get("TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_POSTGRES_URL not set")


@pytest.fixture
async def sessions():
    engine = create_async_engine(URL)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def _request(sessions, fn, *args):
    """Run an endpoint function like get_db does: its own session, commit or roll back."""
    async with sessions() as db:
        try:
            result = await fn(*args, db=db)
            await db.commit()
            return result
        except HTTPException as exc:
            await db.rollback()
            return exc


async def _seed(sessions, n_users: int):
    from app.domains.auth.models import User, UserRole
    from app.domains.companies.models import CompanyProfile
    from app.domains.jobs.models import JobPost
    from app.domains.social.models import Post

    async with sessions() as db:
        users = [
            User(email=f"pg-{uuid.uuid4().hex[:10]}@example.com", full_name="P", role=UserRole.ENGINEER, is_active=True)
            for _ in range(n_users)
        ]
        org = User(email=f"pg-org-{uuid.uuid4().hex[:8]}@example.com", full_name="O", role=UserRole.COMPANY, is_active=True)
        db.add_all([*users, org])
        await db.flush()
        company = CompanyProfile(user_id=org.id, name=f"Org {uuid.uuid4().hex[:6]}")
        db.add(company)
        await db.flush()
        job = JobPost(
            company_id=company.id, title="R", slug=f"r-{uuid.uuid4().hex[:8]}", description="x",
            company_name=company.name, is_remote=True, skills=[],
        )
        post = Post(author_id=org.id, content="hello", visibility="PUBLIC")
        db.add_all([job, post])
        await db.commit()
        return users, job.id, post.id


@pytest.mark.asyncio
async def test_concurrent_duplicate_applies_make_one_row(sessions):
    from app.domains.applications.models import JobApplication
    from app.domains.applications.router import ApplicationCreate, apply_to_job

    (user,), job_id, _ = await _seed(sessions, 1)
    results = await asyncio.gather(
        *[_request(sessions, apply_to_job, job_id, ApplicationCreate(), user) for _ in range(5)]
    )
    conflicts = [r for r in results if isinstance(r, HTTPException)]
    assert len(conflicts) == 4 and all(r.status_code == 409 for r in conflicts)
    async with sessions() as db:
        n = await db.scalar(
            select(func.count()).select_from(JobApplication).where(
                JobApplication.user_id == user.id, JobApplication.job_id == job_id
            )
        )
    assert n == 1


@pytest.mark.asyncio
async def test_concurrent_likes_are_all_counted(sessions):
    from app.domains.social.models import Post, PostLike
    from app.domains.social.router import toggle_like

    users, _, post_id = await _seed(sessions, 8)
    results = await asyncio.gather(*[_request(sessions, toggle_like, post_id, u) for u in users])
    assert all(isinstance(r, dict) and r["liked"] for r in results)
    async with sessions() as db:
        rows = await db.scalar(select(func.count()).select_from(PostLike).where(PostLike.post_id == post_id))
        stored = (await db.get(Post, post_id)).like_count
    assert rows == stored == 8


@pytest.mark.asyncio
async def test_same_person_double_like_is_not_a_server_error(sessions):
    """The (post_id, user_id) primary key made a concurrent double like a 500."""
    from app.domains.social.models import Post, PostLike
    from app.domains.social.router import toggle_like

    (user,), _, post_id = await _seed(sessions, 1)
    results = await asyncio.gather(*[_request(sessions, toggle_like, post_id, user) for _ in range(2)])
    assert all(isinstance(r, dict) for r in results)
    async with sessions() as db:
        rows = await db.scalar(select(func.count()).select_from(PostLike).where(PostLike.post_id == post_id))
        stored = (await db.get(Post, post_id)).like_count
    assert rows == stored


@pytest.mark.asyncio
async def test_concurrent_ai_calls_cannot_all_slip_under_the_allowance(sessions, monkeypatch):
    """AI-01: quota was read before the call and written after, so N parallel
    requests all passed the check. Reservations are serialised and counted."""
    from app.core import database
    from app.core.config import settings
    from app.services.ai import metering

    monkeypatch.setattr(database, "AsyncSessionFactory", sessions)
    monkeypatch.setattr(settings, "AI_FREE_MONTHLY_TOKENS", 1)
    monkeypatch.setattr(settings, "AI_GLOBAL_DAILY_TOKENS", 10**12)
    (user,), _, _ = await _seed(sessions, 1)
    # Widen the gap between reading usage and reserving, so overlapping
    # requests really overlap (without the lock, all of them get through).
    real_tokens_used = metering.tokens_used

    async def slow_tokens_used(*args, **kwargs):
        value = await real_tokens_used(*args, **kwargs)
        await asyncio.sleep(0.05)
        return value

    monkeypatch.setattr(metering, "tokens_used", slow_tokens_used)
    async with sessions() as db:
        metering.set_ai_actor(user.id, db)

        async def attempt():
            try:
                await metering.reserve_ai_tokens()
                return True
            except metering.AIQuotaExceeded:
                return False

        results = await asyncio.gather(*[attempt() for _ in range(5)])
    assert results.count(True) == 1
