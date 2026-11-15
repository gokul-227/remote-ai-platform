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
