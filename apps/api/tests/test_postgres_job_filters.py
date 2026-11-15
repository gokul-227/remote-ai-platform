"""Job search filters on real PostgreSQL (migrated to 074+): bulk upsert stores
derived fields, websearch phrases, jsonb skills, facets, backfill and the
partial indexes. Skipped unless TEST_POSTGRES_URL points at a disposable database."""

import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete, select, text, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

URL = os.environ.get("TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_POSTGRES_URL not set")


@pytest.fixture
async def sessions():
    engine = create_async_engine(URL)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.mark.asyncio
async def test_filters_facets_and_backfill_on_postgres(sessions):
    from app.domains.jobs.backfill import backfill_filters
    from app.domains.jobs.models import JobPost
    from app.domains.jobs.repository import JobRepository
    from app.domains.jobs.schemas import JobPostCreate
    from app.domains.jobs.service import prepare_for_storage

    tag = uuid.uuid4().hex[:10]
    src = f"PGF{tag[:6]}".upper()
    now = datetime.now(UTC)
    jobs = prepare_for_storage(
        [
            JobPostCreate(
                title="Senior Python Engineer",
                description=f"Build data pipelines zz{tag}. Salary $120,000 - $150,000 per year. "
                "Visa sponsorship is available.",
                company_name="PgAcme",
                location="Berlin, Germany (Hybrid)",
                skills=["Python", "AWS"],
                external_id=f"pgf_{tag}_1",
                source=src,
                posted_at=now - timedelta(hours=1),
            ),
            JobPostCreate(
                title="Junior Designer (Contract)",
                description=f"Design pipelines data zz{tag}. We are unable to sponsor visas.",
                company_name="PgBeta",
                location="Remote - Worldwide",
                skills=["figma"],
                external_id=f"pgf_{tag}_2",
                source=src,
                posted_at=now - timedelta(days=10),
            ),
        ]
    )
    try:
        async with sessions() as db:
            ids, _ = await JobRepository(db).bulk_upsert_external_jobs(jobs)
            await db.commit()
        assert len(ids) == 2
        async with sessions() as db:
            repo = JobRepository(db)
            base = {"source": [src], "is_remote": None}
            row = (
                await db.execute(select(JobPost).where(JobPost.external_id == f"pgf_{tag}_1"))
            ).scalar_one()
            assert (row.workplace_type, row.seniority, row.country_code) == ("hybrid", "mid_senior", "DE")
            assert (row.salary_min, row.salary_period, row.visa_sponsorship) == (120000, "year", True)

            async def titles(**f):
                return sorted(j.title for j in await repo.search(**base, **f))

            assert await titles(query=f'"data pipelines" zz{tag}') == ["Senior Python Engineer"]
            assert len(await titles(query=f"pipelines zz{tag}")) == 2
            assert await titles(query=f"zz{tag} -designer") == ["Senior Python Engineer"]
            assert await titles(skills=["python"]) == ["Senior Python Engineer"]
            assert await titles(skills=["Figma"]) == ["Junior Designer (Contract)"]
            assert await titles(workplace=["remote"], region=["worldwide"]) == [
                "Junior Designer (Contract)"
            ]
            assert await titles(job_type=["contract"], seniority=["entry"]) == [
                "Junior Designer (Contract)"
            ]
            assert await titles(posted_within="3d") == ["Senior Python Engineer"]
            assert await titles(visa_sponsorship=False) == ["Junior Designer (Contract)"]
            assert await titles(tz=2) == ["Senior Python Engineer"]
            ranked = await repo.search(**base, query=f"python zz{tag}", sort="relevant")
            assert ranked[0].title == "Senior Python Engineer"
            by_salary = await repo.search(**base, sort="salary")
            assert by_salary[0].title == "Senior Python Engineer"

            facets = await repo.facets(**base, workplace=["hybrid"])
            assert {f["value"]: f["count"] for f in facets["workplace"]} == {"hybrid": 1, "remote": 1}
            assert {f["value"] for f in facets["skills"]} == {"Python", "AWS"}
            assert {f["value"]: f["count"] for f in facets["posted_within"]}["90d"] == 1

            # Backfill: clear one row's derived fields; the task restores them.
            await db.execute(
                update(JobPost)
                .where(JobPost.id.in_(ids))
                .values(workplace_type=None, seniority=None, derived_version=None)
            )
            await db.commit()
            result = await backfill_filters(db, batch_size=1, max_batches=100000)
            assert result["complete"] is True
            row = (
                await db.execute(select(JobPost).where(JobPost.external_id == f"pgf_{tag}_2"))
            ).scalar_one()
            assert (row.workplace_type, row.seniority, row.region) == ("remote", "entry", "worldwide")

            # The partial filter indexes exist and the planner can use them.
            names = set(
                (
                    await db.execute(
                        text("select indexname from pg_indexes where tablename = 'job_posts'")
                    )
                ).scalars()
            )
            assert {
                "ix_job_posts_live_workplace",
                "ix_job_posts_live_skills",
                "ix_job_posts_live_salary",
                "ix_job_posts_underived",
            } <= names
            await db.execute(text("set local enable_seqscan = off"))
            plan = "\n".join(
                (
                    await db.execute(
                        text(
                            "explain select id from job_posts where is_active and not is_deleted "
                            "and expired_at is null and workplace_type = 'remote' "
                            "order by posted_at desc, id desc limit 20"
                        )
                    )
                ).scalars()
            )
            assert "ix_job_posts_live_workplace" in plan
    finally:
        async with sessions() as db:
            await db.execute(delete(JobPost).where(JobPost.source == src))
            await db.commit()
