# Catalogue scale: operation and validation

This change adds PostgreSQL read models, self-excluding GROUPING SETS facets,
recent-sort cursor paging, bounded retention/alert batches, and optional shared
Redis caching. It is not a capacity certification: the supplied 10M-job / 1M-member
seed and k6 workload describe a target, not a verified throughput result.

## Database rollout

Migration `075_scale_read_models` follows `074_job_search_filters`. It creates
`job_employer_stats` and `job_catalogue_stats`, enables RLS on both (no public
policies; the trusted application database owner reads/writes them), adds indexes,
and adjusts autovacuum thresholds. PostgreSQL 17 is the tested database.

The migrator holds its existing session advisory lock; all 075 DDL is transactional.
A fresh database upgrade and 075 downgrade/re-upgrade must pass before rollout.
Plain index creation blocks writes on the indexed table. For large live tables,
prebuild the named indexes CONCURRENTLY in a separate maintenance session using
the definitions in 075, then run the migration. Check `pg_index.indisvalid` and
remove/rebuild invalid indexes first: IF NOT EXISTS does not repair invalid indexes.
Take a backup and schedule a maintenance window if prebuilding is not possible.
Downgrading drops these indexes/read models and resets the listed table reloptions;
API/worker must be rolled back together before downgrade. Overrides that existed
before 075 need to be recorded and restored separately.

Celery `jobs.refresh_catalogue_stats` refreshes common facet totals and employers
every `JOB_STATS_REFRESH_MINUTES` (default 60). Facet models and the employer
readiness marker expire after three refresh intervals; requests fall back to live
queries. An empty employer snapshot is valid. Employer replacement takes a
transaction advisory lock and commits atomically with its marker. Stats use PG
upserts. Large refreshes may exceed the worker task time limit; monitor task
failures and database CPU before increasing TOP_VALUES (default 5). Concurrent
refreshes may duplicate expensive computations even though writes are safe.
The employer snapshot includes at most `JOB_EMPLOYER_STATS_MAX` (default 100000)
company-name groups; slug collisions keep the larger group as before.

## API and freshness

`GET /api/v1/jobs` exposes `X-Next-Cursor` for full recent-sort pages. Pass it as
`after`; cursor paging ignores skip and follows `(posted_at DESC, id DESC)`.
Malformed cursors are ignored. Offset is capped at `JOB_LIST_MAX_SKIP` (10000).
Salary/relevance sorting continues to use bounded offsets, without cursors.
PostgreSQL keyword totals stop at `JOB_KEYWORD_COUNT_CAP` (1000), signalled by
`X-Total-Count-Capped: true`; keyword relevance/facets use a bounded newest-match
window. This changes ranking/count semantics for broad keywords. SQLite retains
its portable exact-count facet implementation. Final-page cursor requests may
return an empty page. Job changes during paging do not create a stable snapshot.

`JOB_CACHE_REDIS_ENABLED` enables shared list/facet caching. Production uses a
separate ephemeral `job-cache` Redis with bounded LRU eviction; the task broker
uses noeviction so cache pressure cannot evict queued jobs. `JOB_CACHE_REDIS_URL`
selects the dedicated instance (falls back to REDIS_URL outside production).
Redis failures/corrupt JSON fall back to local cache/database. Shared TTL defaults
are 120s for lists and 600s for facets, with up to another 60s in local cache.
Job mutations clear local cache only; shared data converges by TTL, and aggregate
read models by refresh/expiry. Do not claim immediate cross-worker invalidation.
No proxy caching overrides are added; preserve application response semantics.

Production retention budget remains the existing configured value. This change
never assumes a larger disk or changes the deletion budget. Memory/worker pool
settings must be checked against the actual host and concurrent worker footprint;
three API processes have up to 30 database connections (6 + 4 per process).

## Local capacity tooling

Use only a disposable database/container. `tests/load/scale/seed.sh` drops seed
objects and job indexes, loads synthetic rows, then rebuilds indexes. Never run it
against a live database. `CONTAINER`, `JOBS`, `USERS`, `PAR`, and `CHUNK` control
its target and size. Run Alembic first; start with a small seed.
`bench.py` reports warm query latency, not end-to-end p95; it catches individual
query failures, so inspect FAILED/timeouts, not just its exit status.

`tests/load/docker-compose.capacity.yml` is a local API/Redis harness; it expects
a separately seeded localhost PostgreSQL at 55432 and mock auth at 9998. API port
28039 avoids the existing visualization stack. It does not start migrations or
seed data. Set RAP_IMAGE to a build from this commit. Use a unique compose project
name and verify ports before starting it. `tests/load/capacity.js` targets 28039 by
default. Its p95/error thresholds are test objectives; no full-sized k6 result was
produced by this change. No Cloudflare cache rule or production rollout is implied.

## Integration conflicts

This branch intentionally stays on its existing base. Preserve SEO's location
aliases, retention cutoff, richer landing statistics, and router SEO caching when
integrating `apps/api/app/domains/jobs/repository.py` and `router.py` (SEO commit
4060590, integrated as 95fafe3). Combine those changes with the new cursor/header,
read-model and optimized facet paths; do not replace whole files with either side.
Also retain expanded landing schemas from the integration branch. Legal/runtime
commit f09a56a changes separate frontend/deploy files and is not included here.

## Validation for this completion

- Fresh PostgreSQL 17 migration through 075; downgrade to 074 and re-upgrade;
  two concurrent 074-to-075 migrators: passed on an isolated local container.
- PG GROUPING SETS/portable facet parity, keyset paging, aggregate refresh/upsert,
  RLS/index presence and API reads plus SQLite/cache checks: 9 passed.
- Backend suite: 994 passed, 15 skipped (PG-specific checks run separately above),
  21 warnings. A non-fatal asyncio logger teardown error followed the successful
  pytest exit. No production database or existing application container was modified.
- Ruff on changed Python domains/config/worker/migration/tests/tooling, mypy on
  repository/service/cache, both Compose configs and shell syntax: passed.
- Full-size load test, target-host memory/throughput and browser journeys remain
  unverified. This commit is neither pushed nor deployed.

## 15 November 2026 tooling verification

The workload now follows HTTP keyset cursors and requires all semantic checks to pass.
The seed/benchmark tools handle small datasets and exit nonzero on benchmark failure.
Three tooling regression tests and shell syntax checks passed. An isolated PostgreSQL17
31-job/1-member seed and query benchmark passed; injected benchmark failure exited1.
The HTTP smoke rerun after correcting seeded seniority values was collected on
16 November 2026; see the bounded local evidence below.
This is tooling validation only, not a target-host throughput or10M-job capacity result.


## 16 November 2026 bounded local HTTP cursor smoke

Passed against source HEAD `67dee38bb3e2ac4ef02b0a9137df083b446c04a6`
(with the local smoke scenario correction described below). The existing
`rap-capacity-smoke-pg` container was inspected and reused without reseeding or
migrating: PostgreSQL 17, loopback `127.0.0.1:55439`, database `rap`, 31 job rows,
1 user, Alembic `076_merge_scale_and_boards`. Seeded seniority values were null,
`associate`, `director`, `mid_senior`, and `entry`.

No API was listening on port 28049 initially. A temporary single-worker API was
started from this checkout's `apps/api` with the existing Python environment at
`/Users/gokulr/Developer/GitHub/remote-ai-platform/apps/api/.venv/bin/python`:

```sh
DATABASE_URL=postgresql+asyncpg://rap:rap@127.0.0.1:55439/rap \
APP_ENV=development DEBUG=false REDIS_URL=redis://127.0.0.1:6399/0 \
JOB_CACHE_REDIS_ENABLED=false SENTRY_DSN= RATE_LIMIT_MAX_REQUESTS=1000 \
DATABASE_POOL_SIZE=2 DATABASE_MAX_OVERFLOW=0 \
/Users/gokulr/Developer/GitHub/remote-ai-platform/apps/api/.venv/bin/python \
  -m uvicorn app.main:app --host 127.0.0.1 --port 28049 --workers 1 --no-access-log
```

Health at `2026-11-16T12:00:09Z` reported database healthy; Redis was deliberately
unavailable on port 6399, workers/scheduler unknown. Shared Redis caching was
disabled. This was a development API, not the production-like Compose harness.
No mock auth or member workload was run.

The previous smoke log showed k6 ignoring top-level `maxDuration` and selecting
its default 10-minute limit. `cursor-smoke.js` now declares an explicit
`shared-iterations` scenario: 1 VU, 3 iterations, `maxDuration: '30s'`,
`gracefulStop: '0s'`. `k6 inspect` confirmed that configuration without warnings.

```sh
node --test tests/load/test_capacity.mjs
k6 inspect tests/load/cursor-smoke.js
k6 run --quiet --summary-export=/tmp/rap-capacity-http-20261116.json \
  -e API=http://127.0.0.1:28049 tests/load/cursor-smoke.js
```

All commands exited 0. Three tooling regression tests passed. k6 v2.4.0 completed
3 iterations, 0 interrupted, in approximately 12.49 seconds: 13/13 checks,
7 HTTP requests, 0 failures, and exactly 1 `route:list_cursor` request. Observed
request p95 was 38.80 ms across these seven requests only; this tiny sample is
not a throughput or latency certification. Auxiliary browse requests are random.
A separate bounded Python urllib check (5-second timeout per request) fetched
`/api/v1/jobs?limit=20`, URL-encoded its `X-Next-Cursor` into `after`, then fetched
the second page. Both responses were 200, with page lengths 20 and 11, zero ID
overlap, 31 unique IDs, and no final cursor.

Exact k6 output/metrics and cursor/page IDs are checked in under
[`tests/load/evidence/2026-11-16-cursor-smoke`](../../tests/load/evidence/2026-11-16-cursor-smoke/).
The temporary API was stopped after verification; the pre-existing PostgreSQL
container was left running. No production target, full-size seed/load, deployment,
or target-host capacity claim is involved.
