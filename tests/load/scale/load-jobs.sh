#!/bin/sh
# Load bounded chunks into the disposable seed container.
set -eu
C=${CONTAINER:-rap-scale-pg}
JOBS=${JOBS:-10000000}
PAR=${PAR:-4}
CHUNK=${CHUNK:-250000}
for value in "$JOBS" "$PAR" "$CHUNK"; do
  case "$value" in ''|*[!0-9]*|0) echo "JOBS, PAR and CHUNK must be positive integers" >&2; exit 2;; esac
done
export C
start=1
while [ "$start" -le "$JOBS" ]; do
  end=$((start + CHUNK - 1))
  [ "$end" -le "$JOBS" ] || end=$JOBS
  echo "$start $end"
  start=$((end + 1))
done | xargs -P "$PAR" -n 2 sh -c 'docker exec "$C" psql -q -v ON_ERROR_STOP=1 -U rap -d rap -v lo="$0" -v hi="$1" -f /seed-jobs.sql'
