"""Time the hot job queries on the seeded scale database (median of 3 warm runs).

    cd apps/api && DATABASE_URL=postgresql+asyncpg://rap:rap@localhost:55432/rap \
      PYTHONPATH=. python ../../tests/load/scale/bench.py [module]

`module` defaults to app.domains.jobs.repository; pass another JobRepository
module (e.g. a copy of the previous revision) to compare before/after.
"""

import asyncio
import importlib
import os
import statistics
import sys
import time
from datetime import UTC, datetime, timedelta

from app.core.config import settings
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

MOD = sys.argv[1] if len(sys.argv) > 1 else "app.domains.jobs.repository"
Repo = importlib.import_module(MOD).JobRepository
TIMEOUT = os.environ.get("BENCH_TIMEOUT", "30s")
ONLY = os.environ.get("BENCH_ONLY")


async def timed(session, name, fn, runs=3):
    out = []
    for _ in range(runs):
        t = time.perf_counter()
        await fn()
        out.append((time.perf_counter() - t) * 1000)
        await session.rollback()
        if out[-1] > 2000:  # slow: one run is enough
            break
    print(f"{name:42s} {statistics.median(out):10.1f} ms", flush=True)


async def main() -> None:
    # Server setting, not SET: a rollback after each case would undo a SET.
    engine = create_async_engine(
        settings.DATABASE_URL, pool_size=2,
        connect_args={"server_settings": {"statement_timeout": TIMEOUT.replace("s", "000")}},
    )
    async with async_sessionmaker(engine)() as s:
        r = Repo(s)
        if os.environ.get("BENCH_REFRESH"):
            from app.domains.jobs.service import JobService

            t = time.perf_counter()
            done = await JobService(r).refresh_catalogue_stats()
            print(f"refresh_catalogue_stats {done} in {time.perf_counter() - t:.1f} s", flush=True)
        last = (await s.execute(text(
            "select posted_at, id from job_posts where is_active and not is_deleted and expired_at is null "
            "order by posted_at desc, id desc offset 100000 limit 1"))).one()
        cases = [
            ("list newest p1", lambda: r.search(limit=20, is_remote=True)),
            ("list newest skip=10000", lambda: r.search(skip=10000, limit=20, is_remote=True)),
            ("list newest skip=100000", lambda: r.search(skip=100000, limit=20, is_remote=True)),
            ("count default", lambda: r.count(is_remote=True)),
            ("list country=DE", lambda: r.search(limit=20, is_remote=True, country=["DE"])),
            ("list seniority+function", lambda: r.search(limit=20, is_remote=True, seniority=["lead"], job_function=["data"])),
            ("list skills=Rust", lambda: r.search(limit=20, is_remote=True, skills=["Rust"])),
            ("list has_salary sort=salary", lambda: r.search(limit=20, sort="salary", is_remote=True, has_salary=True)),
            ("keyword python", lambda: r.search(limit=20, is_remote=True, query="python")),
            ("keyword \"product manager\" relevant", lambda: r.search(limit=20, sort="relevant", is_remote=True, query='"product manager"')),
            ("count keyword python", lambda: r.count(is_remote=True, query="python")),
            ("employer page list", lambda: r.search(limit=20, is_remote=True, employer="NovaSoft Labs")),
            ("facets default", lambda: r.facets(is_remote=True)),
            ("facets country=DE", lambda: r.facets(is_remote=True, country=["DE"])),
            ("facets keyword python", lambda: r.facets(is_remote=True, query="python")),
            ("landing stats keyword python", lambda: r.landing_stats(is_remote=True, query="python")),
            ("employers top 500", lambda: r.employers(limit=500)),
            ("employer_by_slug", lambda: r.employer_by_slug("novasoft-labs")),
            ("sitemap chunk skip=0", lambda: r.sitemap_entries(0, 5000)),
            ("sitemap chunk skip=2M", lambda: r.sitemap_entries(2_000_000, 5000)),
            ("sitemap count", lambda: r.sitemap_count()),
            ("job detail by id", lambda: r.get_by_id(last[1])),
        ]
        if hasattr(Repo, "search") and "after" in Repo.search.__code__.co_varnames:
            cursor = f"{last[0].isoformat()},{last[1]}"
            cases.insert(3, ("list keyset after 100k rows", lambda: r.search(limit=20, is_remote=True, after=cursor)))
        for name, fn in cases:
            if ONLY and ONLY not in name:
                continue
            try:
                await timed(s, name, fn, runs=1 if "skip=2M" in name or "facets" in name else 3)
            except Exception as e:  # noqa: BLE001
                timeout = "statement timeout" in str(e) or "canceling statement" in str(e)
                print(f"{name:42s} {'> ' + TIMEOUT if timeout else 'FAILED ' + str(e)[:80]}", flush=True)
                await s.rollback()
        if ONLY:
            await engine.dispose()
            return
        cutoff = datetime.now(UTC) - timedelta(days=150)
        print("retention batch (5000, rolled back):")
        t = time.perf_counter()
        from app.domains.jobs.models import JobPost
        from sqlalchemy import delete, select

        ids = (await s.execute(select(JobPost.id).where(
            JobPost.company_id.is_(None), JobPost.source != "DIRECT", JobPost.posted_at < cutoff,
            ~r._referenced()).limit(5000))).scalars().all()
        sel = (time.perf_counter() - t) * 1000
        await s.execute(delete(JobPost).where(JobPost.id.in_(ids)))
        print(f"{'  select ids':42s} {sel:10.1f} ms\n{'  select + delete':42s} {(time.perf_counter() - t) * 1000:10.1f} ms")
        await s.rollback()
    await engine.dispose()


asyncio.run(main())
