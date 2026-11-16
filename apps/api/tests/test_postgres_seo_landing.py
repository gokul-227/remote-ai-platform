"""Landing windows and actual plans on a disposable local PostgreSQL database."""

import os
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit

import pytest
from sqlalchemy import event, insert, or_, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.domains.jobs.models import JobPost
from app.domains.jobs.repository import JobRepository

URL = os.environ.get("TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_POSTGRES_URL not set")


@pytest.mark.asyncio
@pytest.mark.parametrize("catalogue_size", [2105, 84000])
async def test_keyword_landing_window_semantics_and_postgres_plans(monkeypatch, catalogue_size):
    assert urlsplit(URL).hostname in {"localhost", "127.0.0.1", "::1"}
    engine = create_async_engine(URL)
    statements = []

    def capture(conn, clause, multiparams, params, execution_options):
        if getattr(clause, "is_select", False):
            statements.append(clause)

    event.listen(engine.sync_engine, "before_execute", capture)
    monkeypatch.setattr(settings, "JOB_KEYWORD_COUNT_CAP", 1000)
    tag = uuid.uuid4().hex
    now = datetime.now(UTC)
    try:
        async with async_sessionmaker(engine)() as db:
            # Transaction rollback preserves all existing disposable DB data.
            await db.execute(text("SET LOCAL statement_timeout = '10s'"))
            await db.execute(
                insert(JobPost),
                [
                    {
                        "slug": f"landing-{tag}-{i}",
                        "title": "Python engineer",
                        "description": "Python work",
                        "source": tag,
                        "company_name": "Window" if i < 1000 else "Outside",
                        "posted_at": now - timedelta(seconds=i),
                        "salary_min": None if i < 10 else (100 if i < 1000 else 900),
                        "salary_max": None if i < 10 else (200 if i < 1000 else 1000),
                        "currency": "USD",
                        "salary_period": "year",
                        "seniority": "entry",
                        "skills": ["Python" if i < 1000 else "Outside"],
                    }
                    for i in range(catalogue_size)
                ],
            )
            statements.clear()
            repo = JobRepository(db)
            bounded = await repo.landing_stats(query="Python", source=[tag])
            keyword_statements = list(statements)
            assert bounded["total"] == bounded["new_last_7_days"] == 1000
            assert bounded["top_companies"] == [{"name": "Window", "count": 1000}]
            # Exclude missing salary AFTER selecting the newest 1000 IDs.
            assert bounded["salary"]["count"] == 990
            assert bounded["salary"]["low"] == bounded["salary"]["high"] == 150
            assert bounded["salary_by_seniority"]
            exact = await repo.landing_stats(source=[tag])
            assert exact["total"] == exact["new_last_7_days"] == catalogue_size
            assert exact["top_companies"] == [
                {"name": "Outside", "count": catalogue_size - 1000},
                {"name": "Window", "count": 1000},
            ]
            assert exact["salary"]["count"] == 2000
            # Keyword skills/trend must exclude older rows outside the selected IDs.
            assert bounded["top_skills"] == [{"name": "Python", "count": 1000}]
            assert exact["top_skills"] == [
                {"name": "Outside", "count": 1000},
                {"name": "Python", "count": 1000},
            ]
            assert sum(bounded["weekly_new"]) == 1000
            assert sum(exact["weekly_new"]) == 2000
            for stmt in keyword_statements[2:5]:
                sql = str(
                    stmt.compile(dialect=engine.dialect, compile_kwargs={"literal_binds": True})
                )
                plan = (
                    await db.execute(text("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql))
                ).scalar_one()[0]

                def nodes(node):
                    yield node
                    for child in node.get("Plans", []):
                        yield from nodes(child)

                tree = list(nodes(plan["Plan"]))
                scans = [n for n in tree if n.get("Relation Name") == "job_posts"]
                assert len(scans) == 1, plan
                # A parallel scan runs once per worker, not once per outer row.
                workers = sum(n.get("Workers Launched", 0) for n in tree)
                assert scans[0]["Actual Loops"] <= workers + 1, plan
                assert not any(n.get("Parent Relationship") == "SubPlan" for n in tree), plan
                windows = [
                    n for n in tree if n["Node Type"] == "Limit" and n["Actual Rows"] == 1000
                ]
                assert windows, plan
                assert all(n["Actual Loops"] == 1 for n in windows), plan
                print(
                    f"landing plan: {plan['Execution Time']}ms; scans=1; window rows=1000; window loops=1"
                )
            # Original salary SQL shape from the rolled-back implementation:
            # the same full-text filters outside and inside the capped IN query.
            baseline = (
                repo._filtered(
                    select(
                        JobPost.salary_min,
                        JobPost.salary_max,
                        JobPost.currency,
                        JobPost.salary_period,
                        JobPost.seniority,
                    ),
                    query="Python",
                    source=[tag],
                )
                .where(
                    JobPost.currency.is_not(None),
                    JobPost.salary_period.is_not(None),
                    or_(JobPost.salary_min.is_not(None), JobPost.salary_max.is_not(None)),
                    JobPost.id.in_(
                        repo._filtered(
                            select(JobPost.id),
                            query="Python",
                            source=[tag],
                        )
                        .order_by(JobPost.posted_at.desc(), JobPost.id.desc())
                        .limit(1000)
                    ),
                )
                .order_by(JobPost.posted_at.desc())
                .limit(2000)
            )
            sql = str(
                baseline.compile(dialect=engine.dialect, compile_kwargs={"literal_binds": True})
            )
            # Savepoint recovery leaves the outer fixture transaction usable if
            # PostgreSQL cancels the legacy query. Never let it run unbounded.
            try:
                async with db.begin_nested():
                    await db.execute(text("SET LOCAL statement_timeout = '2s'"))
                    before = (
                        await db.execute(text("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql))
                    ).scalar_one()[0]
                    print(
                        f"legacy salary ({catalogue_size} rows): {before['Execution Time']}ms; "
                        f"root={before['Plan']['Node Type']}"
                    )
            except DBAPIError as exc:
                if getattr(exc.orig, "sqlstate", None) != "57014":
                    raise
                print(f"legacy salary ({catalogue_size} rows): cancelled at 2000ms timeout")
            await db.rollback()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_live_keyword_query_can_use_partial_fulltext_index():
    assert urlsplit(URL).hostname in {"localhost", "127.0.0.1", "::1"}
    engine = create_async_engine(URL)
    try:
        async with async_sessionmaker(engine)() as db:
            # Rows plus statistics (rolled back with the transaction): on an empty,
            # never-analyzed table every index with the same live predicate (075
            # added ix_job_posts_live_pay/_sitemap/_employer) costs the same as the
            # full-text one, so the planner's pick says nothing about whether the
            # query matches ix_job_posts_live_fts. With a selective keyword over
            # thousands of live rows only the GIN index is cheap.
            tag = uuid.uuid4().hex
            await db.execute(
                insert(JobPost),
                [
                    {
                        "slug": f"fts-{tag}-{i}",
                        "title": "Python engineer" if i < 5 else "Account executive",
                        "description": "Role description",
                        "source": tag,
                        "company_name": "Plan",
                        "skills": [],
                    }
                    for i in range(3000)
                ],
            )
            await db.execute(text("ANALYZE job_posts"))
            await db.execute(text("SET LOCAL enable_seqscan = off"))
            await db.execute(text("SET LOCAL enable_indexscan = off"))
            await db.execute(text("SET LOCAL enable_indexonlyscan = off"))
            repo = JobRepository(db)
            stmt = repo._filtered(select(JobPost.id), query="python", is_remote=True).limit(1000)
            sql = str(stmt.compile(dialect=engine.dialect, compile_kwargs={"literal_binds": True}))
            plan = (await db.execute(text("EXPLAIN (FORMAT JSON) " + sql))).scalar_one()[0]

            def index_names(node):
                yield node.get("Index Name")
                for child in node.get("Plans", []):
                    yield from index_names(child)

            assert "ix_job_posts_live_fts" in set(index_names(plan["Plan"])), plan
            # The old boolean spelling was semantically equivalent for NOT NULL
            # columns but could not imply the partial index's bare predicates.
            legacy_sql = sql.replace("job_posts.is_active AND", "job_posts.is_active IS TRUE AND").replace(
                "NOT job_posts.is_deleted", "job_posts.is_deleted IS FALSE"
            )
            legacy = (await db.execute(text("EXPLAIN (FORMAT JSON) " + legacy_sql))).scalar_one()[0]
            assert "ix_job_posts_live_fts" not in set(index_names(legacy["Plan"])), legacy
    finally:
        await engine.dispose()
