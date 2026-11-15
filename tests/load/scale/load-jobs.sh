#!/bin/sh
# Load JOBS synthetic job_posts in CHUNK-row chunks, PAR at a time (see seed.sh).
set -eu
C=${CONTAINER:-rap-scale-pg}
JOBS=${JOBS:-10000000}
PAR=${PAR:-4}
CHUNK=${CHUNK:-250000}
seq -f %.0f 1 "$CHUNK" "$JOBS" | xargs -P "$PAR" -n 1 sh -c \
  "docker exec $C psql -q -v ON_ERROR_STOP=1 -U rap -d rap -v lo=\$0 -v hi=\$((\$0 + $CHUNK - 1)) -f /seed-jobs.sql"
