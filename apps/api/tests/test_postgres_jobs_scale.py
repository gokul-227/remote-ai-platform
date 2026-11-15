"""Scale SQL contracts against a disposable database migrated to head."""
import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.domains.jobs.models import JobCatalogueStat, JobEmployerStat, JobPost
from app.domains.jobs.repository import JobRepository, job_cursor

URL = os.environ.get("TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_POSTGRES_URL not set")


@pytest.fixture
async def pg_db():
    engine = create_async_engine(URL)
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        yield db
        await db.rollback()
    await engine.dispose()


async def test_pg_facets_keyset_and_read_models(pg_db):
    db = pg_db
    repo = JobRepository(db)
    token = uuid.uuid4().hex
    now = datetime.now(UTC)
    jobs = [JobPost(
        title="Python developer", slug=f"{token}-{i}", description="Python backend",
        company_name=f"Scale {token}", is_remote=True, skills=["Python", "SQL"],
        country_code="DE" if i % 2 else "US", workplace_type="remote",
        visa_sponsorship=bool(i % 2), posted_at=now - timedelta(minutes=i),
        source="REMOTEOK", salary_min=50000 if i % 2 else None,
    ) for i in range(6)]
    db.add_all(jobs)
    await db.commit()
    try:
        # GROUPING SETS must preserve portable self-excluding facet semantics.
        for filters in ({}, {"country": ["DE"]}, {"is_remote": True},
                        {"visa_sponsorship": False}, {"has_salary": True},
                        {"query": "Python", "country": ["DE"]}):
            actual = await repo.facets(**filters)
            expected = await repo._facets_each(**filters)
            def canonical(values):
                return sorted((str(v["value"]), v["count"]) for v in values)
            assert {k: canonical(v) for k, v in actual.items()} == {
                k: canonical(v) for k, v in expected.items()
            }
        first = await repo.search(limit=2)
        second = await repo.search(limit=2, after=job_cursor(first[-1]))
        assert [j.id for j in second] == [j.id for j in await repo.search(skip=2, limit=2)]
        from app.domains.jobs.schemas import JobSearchQuery
        from app.domains.jobs.service import JobService

        result = await JobService(repo).refresh_catalogue_stats()
        assert result["searches"] >= 1
        cached = await JobService(repo)._stored_facets(JobSearchQuery(is_remote=True))
        assert cached is not None
        assert cached["total"] >= 6
        await repo.refresh_employer_stats()
        assert (await repo.employer_by_slug(f"scale-{token}"))["count"] == 6
        await repo.store_stat("test:scale", {"total": 6})
        await repo.store_stat("test:scale", {"total": 7})
        assert (await repo.stored_stat("test:scale", timedelta(minutes=1)))["total"] == 7
        # Migration enables RLS and creates the expression/covering indexes.
        assert await db.scalar(text("SELECT relrowsecurity FROM pg_class WHERE oid='job_catalogue_stats'::regclass"))
        assert await db.scalar(text("SELECT count(*) FROM pg_indexes WHERE indexname IN ('ix_job_posts_live_employer', 'ix_job_posts_live_sitemap', 'ix_saved_job_searches_due')")) == 3
    finally:
        await db.rollback()
        await db.execute(delete(JobEmployerStat).where(JobEmployerStat.slug == f"scale-{token}"))
        await db.execute(delete(JobCatalogueStat).where(JobCatalogueStat.key.in_(["test:scale", "employers:ready"])))
        await db.execute(delete(JobPost).where(JobPost.slug.startswith(token)))
        await db.commit()


async def test_pg_api_read_paths(pg_db):
    from httpx import ASGITransport, AsyncClient

    from app.core.database import get_db
    from app.domains.jobs import list_cache
    from app.main import app

    previous = app.dependency_overrides[get_db]

    async def use_pg():
        yield pg_db

    app.dependency_overrides[get_db] = use_pg
    list_cache.clear()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            for path in ("/api/v1/jobs", "/api/v1/jobs/facets", "/api/v1/jobs/employers", "/api/v1/jobs/landing-stats"):
                response = await client.get(path)
                assert response.status_code == 200, response.text
            assert (await client.get("/api/v1/jobs?skip=10001")).status_code == 422
    finally:
        app.dependency_overrides[get_db] = previous
        list_cache.clear()
