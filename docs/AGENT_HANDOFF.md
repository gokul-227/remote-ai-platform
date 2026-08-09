# Agent Handoff

Date: 2026-08-09

## Where the project stands

The WorkMesh AI platform is a verified working local deployment. The fresh-clone gate passed end-to-end. All required containers are healthy, database reaches migration HEAD 022_groups with 43 tables, seed data is present, backend tests pass (93/93), frontend lint/tsc/build pass, and live E2E suites for platform, WebSocket messaging, and task dispatch all pass.

## How to start

    docker compose -f infra/docker/docker-compose.yml up -d --build

    API      http://localhost:8000
    Swagger  http://localhost:8000/docs
    Web      http://localhost:3000
    Keycloak http://localhost:8080
    MinIO    http://localhost:9001

## How to run backend tests

    docker compose -f infra/docker/docker-compose.yml run --rm test

## Seed accounts

- admin@workmesh.ai / admin123
- engineer@workmesh.ai / engineer123
- company@workmesh.ai / company123

## Key implementation notes

- API start-production.sh runs alembic upgrade head, then seeds, then uvicorn (deterministic fresh-clone order)
- The compose test service builds the test Docker target with dev dependencies and runs pytest against in-memory SQLite
- Local JWT (pbkdf2 hashed passwords) is the active auth path; Keycloak is healthy and realm-imported but not the active API token source
- Payments are SANDBOX escrow + ledger only
- AI defaults to ollama at host.docker.internal:11434 with a deterministic fallback when no LLM is reachable

## Changed in this pass

- Added public GET /jobs/company/{company_id}
- Added company_id filter to job search (backend schema/repo/service/router + frontend jobs page/company link)
- Fixed work-ledger frontend/backend path mismatch
- Added publish/unpublish PATCH endpoint for jobs + RBAC test
- Implemented Redis pub/sub ConnectionManager for real-time chat
- Added test Dockerfile target and compose test service
- Moved seeding before uvicorn startup in start-production.sh
- Verified all live E2E flows (platform, WebSocket, task dispatch) and updated docs