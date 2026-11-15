#!/bin/sh
# Seed a LOCAL scale-test database (docs/operations/capacity.md). Never production.
#   docker run -d --name rap-scale-pg -p 55432:5432 -e POSTGRES_USER=rap -e POSTGRES_PASSWORD=rap -e POSTGRES_DB=rap postgres:17
#   (cd apps/api && DATABASE_URL=postgresql+asyncpg://rap:rap@localhost:55432/rap alembic upgrade head)
#   JOBS=10000000 USERS=1000000 PAR=4 tests/load/scale/seed.sh
# Job indexes are dropped before the load and rebuilt after it (seed-indexes.sql),
# which is how a bulk load is done and measures the index build time too.
set -eu
C=${CONTAINER:-rap-scale-pg}
JOBS=${JOBS:-10000000}
USERS=${USERS:-1000000}
PAR=${PAR:-4}
CHUNK=${CHUNK:-250000}
for value in "$JOBS" "$USERS" "$PAR" "$CHUNK"; do
  case "$value" in ''|*[!0-9]*|0) echo "seed sizes must be positive integers" >&2; exit 2;; esac
done
HERE=$(cd "$(dirname "$0")" && pwd)
PSQL="docker exec -i $C psql -q -v ON_ERROR_STOP=1 -U rap -d rap"
for f in seed-setup.sql seed-jobs.sql seed-users.sql seed-indexes.sql; do docker cp "$HERE/$f" "$C:/$f"; done

$PSQL -f /seed-setup.sql
$PSQL -c "CREATE TABLE IF NOT EXISTS seed.jobidx AS SELECT indexname, indexdef FROM pg_indexes
          WHERE tablename = 'job_posts' AND indexname NOT IN ('job_posts_pkey', 'ix_job_posts_external_id')"
$PSQL -Atc "SELECT 'DROP INDEX IF EXISTS ' || indexname || ';' FROM seed.jobidx" | $PSQL

start=$(date +%s)
CONTAINER="$C" JOBS="$JOBS" PAR="$PAR" CHUNK="$CHUNK" sh "$HERE/load-jobs.sh"
echo "jobs loaded in $(( $(date +%s) - start ))s"

start=$(date +%s)
$PSQL -v users="$USERS" -f /seed-users.sql
echo "users loaded in $(( $(date +%s) - start ))s"

start=$(date +%s)
$PSQL -f /seed-indexes.sql
echo "indexes built in $(( $(date +%s) - start ))s"
$PSQL -c "VACUUM (ANALYZE)"
