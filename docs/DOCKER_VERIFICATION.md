# Docker Verification

Date: 2026-08-09 (evidence from clean fresh-clone run)

## Command sequence verified

    docker compose -f infra/docker/docker-compose.yml down -v
    docker compose -f infra/docker/docker-compose.yml build --no-cache
    docker compose -f infra/docker/docker-compose.yml up -d

## Container health (docker compose ps)

| Container | Status |
|---|---|
| remote-ai-platform-api | Up (healthy) |
| remote-ai-platform-celery-beat | Up (healthy) |
| remote-ai-platform-celery-worker | Up (healthy) |
| remote-ai-platform-keycloak | Up (healthy) |
| remote-ai-platform-minio | Up (healthy) |
| remote-ai-platform-postgres | Up (healthy) |
| remote-ai-platform-redis | Up (healthy) |
| remote-ai-platform-web | Up (healthy) |

## Automatic initialization

- postgres-init.sql runs on first boot
- minio-init creates buckets: remote-ai-platform-resumes, remote-ai-platform-assets
- Keycloak imports realm-remote-ai-platform.json
- API start-production.sh runs: alembic upgrade head, then seed data, then uvicorn
- celery worker + beat start and pass healthchecks

## Database state after fresh up

- alembic_version = 022_groups (single head)
- 43 tables in public schema
- Seed users: admin@workmesh.ai, engineer@workmesh.ai, company@workmesh.ai
- Seed jobs: 2 job posts (is_remote = true, is_active = true)
- Seed groups: 2 developer groups

## API/web endpoints

- GET http://localhost:8000/api/v1/health -> 200 status ok, database ok, queues ok
- GET http://localhost:8000/openapi.json -> 200
- GET http://localhost:3000 -> 200

## Test service

    docker compose -f infra/docker/docker-compose.yml run --rm test

Result: 93 passed in 8.24s (in-memory SQLite)