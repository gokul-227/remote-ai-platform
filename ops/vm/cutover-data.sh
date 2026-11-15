#!/usr/bin/env bash
# Production data cut-over to the VM. Run from a workstation with Infisical logged in.
#   ops/vm/cutover-data.sh db      fresh dump of Supabase -> empty PostgreSQL 17 on the VM -> alembic head
#   ops/vm/cutover-data.sh files   copy every object Supabase Storage -> OCI buckets, then verify
# Read-only on Supabase. Secrets are passed over SSH stdin, never on a command line or in output.
set -euo pipefail
P=237deba5-a70e-4571-8529-26597d6e4631
T="opc@${VM_HOST:-79.76.118.213}"; K="${VM_SSH_KEY_FILE:-$HOME/.ssh/oci_rap}"
get(){ infisical secrets get "$1" --projectId "$P" --env prod --path "$2" --plain --silent; }
vm(){ ssh -i "$K" -o BatchMode=yes "$T" "$@"; }
C="docker compose -p rap-prod -f /opt/rap/repo/infra/docker/docker-compose.prod.yml --env-file /opt/rap/.env"

case "${1:-}" in
db)
  SRC="$(get DATABASE_URL /render-api | sed 's/+asyncpg//')"
  echo "1/5 dump production (pg_dump 17, public schema)"
  printf '%s' "$SRC" | vm 'read -r SRC; sudo mkdir -p /var/backups/rap && sudo chown opc /var/backups/rap;
    docker run --rm -e SRC="$SRC" -v /var/backups/rap:/out postgres:17 \
      sh -c "pg_dump --format=custom --no-owner --no-privileges --schema=public --file=/out/cutover.dump \"\$SRC\"" && ls -la /var/backups/rap/cutover.dump | awk "{print \$5\" bytes\"}"'
  echo "2/5 stop app containers, recreate an empty PostgreSQL 17 volume"
  vm "$C stop api worker scheduler 2>/dev/null; $C rm -sf postgres; docker volume rm rap-prod_postgres_data >/dev/null 2>&1 || true; $C up -d postgres && for i in \$(seq 1 30); do docker exec rap-prod-postgres-1 pg_isready -U rap -d remote_ai_platform >/dev/null 2>&1 && break; sleep 2; done; docker exec rap-prod-postgres-1 postgres --version"
  echo "3/5 extensions + restore"
  vm 'docker exec rap-prod-postgres-1 psql -U rap -d remote_ai_platform -v ON_ERROR_STOP=1 -qc "CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"; CREATE EXTENSION IF NOT EXISTS pg_stat_statements;" &&
    docker cp /var/backups/rap/cutover.dump rap-prod-postgres-1:/tmp/cutover.dump &&
    docker exec rap-prod-postgres-1 sh -c "pg_restore --list /tmp/cutover.dump | grep -Ev \"SCHEMA - public|COMMENT - SCHEMA public\" > /tmp/toc && pg_restore -U rap -d remote_ai_platform --no-owner --no-privileges --exit-on-error --single-transaction --use-list=/tmp/toc /tmp/cutover.dump" && docker exec rap-prod-postgres-1 rm -f /tmp/cutover.dump /tmp/toc && echo restored'
  echo "4/5 migrate to head"
  vm "$C run --rm --no-deps api alembic upgrade head 2>&1 | tail -3"
  echo "5/5 row counts (VM)"
  vm 'docker exec rap-prod-postgres-1 psql -U rap -d remote_ai_platform -Atc "select count(*) from users; select count(*) from job_posts; select version_num from alembic_version"'
  ;;
files)
  SRC_EP="$(get MINIO_ENDPOINT /render-api)"; case "$SRC_EP" in http*) ;; *) SRC_EP="https://$SRC_EP";; esac; R="$(get MINIO_BUCKET_RESUMES /render-api)"; A="$(get MINIO_BUCKET_ASSETS /render-api)"
  printf '%s\n%s\n%s\n%s\n%s\n%s\n' "$(get MINIO_ACCESS_KEY /render-api)" "$(get MINIO_SECRET_KEY /render-api)" "$(get R2_ACCESS_KEY_ID /vm)" "$(get R2_SECRET_ACCESS_KEY /vm)" "$SRC_EP" "$(get R2_ENDPOINT /vm)" |
  vm "read -r SA; read -r SS; read -r DA; read -r DS; read -r SE; read -r DE;
    docker run --rm -i -e SRC_ENDPOINT=\"\$SE\" -e SRC_ACCESS_KEY=\"\$SA\" -e SRC_SECRET_KEY=\"\$SS\" -e DST_ENDPOINT=\"\$DE\" -e DST_ACCESS_KEY=\"\$DA\" -e DST_SECRET_KEY=\"\$DS\" -e SRC_REGION=eu-west-1 -e DST_REGION=eu-frankfurt-1 \
      -e BUCKETS='$R=rap-prod-resumes,$A=rap-prod-assets' \
      -v /opt/rap/repo/ops/storage:/tool:ro python:3.12-slim sh -c 'pip -q install boto3 >/dev/null 2>&1 && python /tool/migrate_objects.py --apply && python /tool/migrate_objects.py --verify'"
  ;;
*) echo "usage: $0 db|files" >&2; exit 2;;
esac
