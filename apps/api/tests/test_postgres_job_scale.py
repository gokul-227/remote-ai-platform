"""Bulk job upserts, full-text search and retention on real PostgreSQL (migrated to
070+). Skipped unless TEST_POSTGRES_URL points at a disposable database."""

import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

URL = os.environ.get("TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_POSTGRES_URL not set")


@pytest.fixture
async def sessions():
    engine = create_async_engine(URL)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.mark.asyncio
async def test_bulk_upsert_inserts_skips_unchanged_and_updates_changed(sessions):
    from app.domains.jobs.models import JobPost
    from app.domains.jobs.repository import JobRepository
    from app.domains.jobs.schemas import JobPostCreate
    from app.domains.jobs.service import prepare_for_storage

    tag = uuid.uuid4().hex[:10]
    posted = datetime.now(UTC) - timedelta(days=5)

    def batch(title_suffix: str = "") -> list[JobPostCreate]:
        return prepare_for_storage(
            [
                JobPostCreate(
                    title=f"Engineer {tag} {i}{title_suffix if i == 0 else ''}",
                    description=f"Python zebracorn{tag} work",
                    company_name="Bulk Co",
                    external_id=f"pgbulk_{tag}_{i}",
                    source="PGTEST",
                    posted_at=posted,
                )
                for i in range(1200)
            ]
        )

    try:
        async with sessions() as db:
            repo = JobRepository(db)
            inserted: list[uuid.UUID] = []
            for start in range(0, 1200, 500):
                ids, updated = await repo.bulk_upsert_external_jobs(batch()[start : start + 500])
                inserted += ids
                assert updated == 0
            await db.commit()
        assert len(inserted) == 1200
        async with sessions() as db:
            row = (
                await db.execute(select(JobPost).where(JobPost.external_id == f"pgbulk_{tag}_0"))
            ).scalar_one()
            assert row.dedup_key
            assert len(row.dedup_key) == 32
            assert abs((row.posted_at - posted).total_seconds()) < 1
            before = row.updated_at
        # Same content again: nothing is rewritten (no new row versions).
        async with sessions() as db:
            ids, updated = await JobRepository(db).bulk_upsert_external_jobs(batch()[:500])
            await db.commit()
        assert (ids, updated) == ([], 0)
        # One changed title: exactly one row updated; posted_at is kept.
        async with sessions() as db:
            ids, updated = await JobRepository(db).bulk_upsert_external_jobs(batch(" v2")[:500])
            await db.commit()
        assert (ids, updated) == ([], 1)
        async with sessions() as db:
            row = (
                await db.execute(select(JobPost).where(JobPost.external_id == f"pgbulk_{tag}_0"))
            ).scalar_one()
            assert row.title.endswith("v2")
            assert row.updated_at >= before
            assert abs((row.posted_at - posted).total_seconds()) < 1
            # Full-text search finds it through the description prefix.
            found = await JobRepository(db).search(query=f"zebracorn{tag}", is_remote=None, limit=5)
            assert len(found) == 5
            await db.execute(text("SET LOCAL enable_seqscan = off"))  # tiny CI tables
            plan = "\n".join(
                r[0]
                for r in (
                    await db.execute(
                        text(
                            "EXPLAIN SELECT id FROM job_posts WHERE is_active AND NOT is_deleted "
                            "AND expired_at IS NULL ORDER BY posted_at DESC, id DESC LIMIT 20"
                        )
                    )
                ).all()
            )
            assert "ix_job_posts_live_recent" in plan
    finally:
        async with sessions() as db:
            await db.execute(delete(JobPost).where(JobPost.source == "PGTEST"))
            await db.commit()


@pytest.mark.asyncio
async def test_retention_batches_on_postgres(sessions):
    from app.domains.jobs.models import JobPost
    from app.domains.jobs.repository import JobRepository

    old = datetime.now(UTC) - timedelta(days=100)
    async with sessions() as db:
        db.add_all(
            [
                JobPost(title="Old", slug=f"o-{uuid.uuid4().hex[:8]}", description="d",
                        company_name="C", source="PGTEST", posted_at=old,
                        external_id=f"pgret_{uuid.uuid4().hex}")
                for _ in range(25)
            ]
        )
        await db.commit()
    try:
        async with sessions() as db:
            removed, _ = await JobRepository(db).purge_old_imported_jobs(90, batch_size=10)
        assert removed >= 25
        async with sessions() as db:
            left = (await db.execute(select(JobPost.id).where(JobPost.source == "PGTEST"))).all()
        assert left == []
    finally:
        async with sessions() as db:
            await db.execute(delete(JobPost).where(JobPost.source == "PGTEST"))
            await db.commit()
