"""Phase 04: retries and double clicks must not create duplicate rows or skew counters."""

import uuid

import pytest
from auth_support import token_for
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError


async def _user(client: AsyncClient, role: str = "ENGINEER"):
    from conftest import TestingSessionLocal

    from app.domains.auth.models import User

    email = f"dup-{uuid.uuid4().hex[:8]}@example.com"
    await client.post("/api/v1/auth/register", json={"email": email, "password": "p", "full_name": "D", "role": role})
    async with TestingSessionLocal() as db:
        return await db.scalar(select(User).where(User.email == email))


def _h(user) -> dict:
    return {"Authorization": f"Bearer {token_for(user)}"}


async def _direct_job(client: AsyncClient) -> uuid.UUID:
    from conftest import TestingSessionLocal

    from app.domains.jobs.models import JobPost

    org = await _user(client, "COMPANY")
    company = await client.post("/api/v1/companies/me", headers=_h(org), json={"name": f"Org {uuid.uuid4().hex[:6]}"})
    async with TestingSessionLocal() as db:
        job = JobPost(
            company_id=uuid.UUID(company.json()["id"]), title="R", slug=f"r-{uuid.uuid4().hex[:8]}",
            description="x", company_name="Org", is_remote=True, skills=[],
        )
        db.add(job)
        await db.commit()
        return job.id


@pytest.mark.asyncio
async def test_database_allows_one_application_per_person_per_job(client: AsyncClient):
    from conftest import TestingSessionLocal

    from app.domains.applications.models import JobApplication

    user, job_id = await _user(client), await _direct_job(client)
    async with TestingSessionLocal() as db:
        db.add(JobApplication(user_id=user.id, job_id=job_id, status="SUBMITTED"))
        await db.commit()
        db.add(JobApplication(user_id=user.id, job_id=job_id, status="SUBMITTED"))
        with pytest.raises(IntegrityError):
            await db.commit()


@pytest.mark.asyncio
async def test_repeated_apply_creates_one_application(client: AsyncClient):
    """Sequential here (the SQLite harness shares one connection); concurrent
    duplicates are exercised on PostgreSQL in test_postgres_concurrency.py."""
    from conftest import TestingSessionLocal

    from app.domains.applications.models import JobApplication

    user, job_id = await _user(client), await _direct_job(client)
    codes = [(await client.post(f"/api/v1/applications/jobs/{job_id}", headers=_h(user), json={})).status_code for _ in range(3)]
    assert codes == [201, 409, 409]
    async with TestingSessionLocal() as db:
        n = await db.scalar(
            select(func.count()).select_from(JobApplication).where(
                JobApplication.user_id == user.id, JobApplication.job_id == job_id
            )
        )
    assert n == 1


@pytest.mark.asyncio
async def test_database_allows_one_like_per_person_per_post(client: AsyncClient):
    from conftest import TestingSessionLocal

    from app.domains.social.models import PostLike

    author = await _user(client)
    post = await client.post("/api/v1/social/posts", headers=_h(author), json={"content": "hello"})
    post_id = uuid.UUID(post.json()["id"])
    async with TestingSessionLocal() as db:
        db.add(PostLike(post_id=post_id, user_id=author.id))
        await db.commit()
        db.add(PostLike(post_id=post_id, user_id=author.id))
        with pytest.raises(IntegrityError):
            await db.commit()


@pytest.mark.asyncio
async def test_like_count_matches_likes(client: AsyncClient):
    from conftest import TestingSessionLocal

    from app.domains.social.models import Post, PostLike

    author = await _user(client)
    post = await client.post("/api/v1/social/posts", headers=_h(author), json={"content": "hello"})
    post_id = post.json()["id"]
    likers = [await _user(client) for _ in range(4)]
    # Sequential here: the SQLite test harness shares one connection, so true
    # concurrency is exercised on PostgreSQL in test_postgres_concurrency.py.
    for u in likers:
        r = await client.post(f"/api/v1/social/posts/{post_id}/like", headers=_h(u))
        assert r.status_code == 200 and r.json()["liked"]
    async with TestingSessionLocal() as db:
        rows = await db.scalar(select(func.count()).select_from(PostLike).where(PostLike.post_id == uuid.UUID(post_id)))
        stored = (await db.get(Post, uuid.UUID(post_id))).like_count
    assert rows == stored == 4
