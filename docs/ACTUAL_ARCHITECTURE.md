# Actual Architecture

Date: 2026-08-09 (verified against the running fresh-clone stack)

## Stack

| Layer | Technology | Container |
|---|---|---|
| API | FastAPI (Python 3.11, SQLAlchemy 2 async) | api |
| Web | Next.js 14 (App Router, TypeScript, Tailwind) | web |
| Database | PostgreSQL 16 | postgres |
| Cache / broker | Redis 7 | redis |
| Object storage | MinIO | minio + minio-init |
| Identity | Keycloak 24 (realm import) | keycloak |
| Background jobs | Celery worker + beat | celery-worker, celery-beat |
| Tests | pytest (in-memory SQLite) | test |

## API Layout

- app/main.py — FastAPI app + lifespan (DB verify, alembic upgrade, seed)
- app/core — config, database, security (pbkdf2_sha256 + JWT), cache, storage (MinIO), health, middleware, metrics, exceptions
- app/domains — auth, engineers, companies, jobs, applications, saved_jobs, search, matching, network, messaging, notifications, social, groups, projects, contracts, payments, trust, quality, marketplace, admin
- app/workers — Celery app (queues: default, jobs, ai, matching)
- app/services/ai — LLM client, model config, fallback chain (Ollama/LiteLLM)
- app/agents — job enricher, resume parser, quality engine
- alembic/ — 22 migrations, head 022_groups

## Frontend

- src/app — pages (workspace, jobs, projects, quality, admin, companies, etc.)
- src/hooks — useAuth, useJobs, useProfile, useNotifications, useMessages, useWorkerWorkspace, etc.
- src/lib — API client and shared utilities
- All API calls go to NEXT_PUBLIC_API_URL defaulting to http://localhost:8000

## Startup Order (fresh clone)

1. postgres (init SQL) -> redis -> minio -> minio-init -> keycloak -> api -> worker/beat -> web
2. api start-production.sh: alembic upgrade head, seed demo data, then uvicorn
3. web depends on api healthy

## Auth

- Local JWT (access + optional refresh) is the active path for API auth
- Keycloak runs healthy with imported realm; frontend may use Keycloak for SSO but the API validates local JWTs via require_role
- Password hashing: pbkdf2_sha256 (passlib)

## Payments

- Sandbox escrow + ledger only. No real money movement.
- PaymentTransaction rows, provider=SANDBOX, escrow/release/refund lifecycle.

## AI

- Default provider ollama at host.docker.internal:11434 (model qwen2.5)
- Fallback chain via AI_FALLBACK_PROVIDERS; deterministic heuristic fallback when no LLM is reachable
- AI usage tracked in ai_usage_logs; quality engine persists reports

## Observability

- GET /api/v1/health returns database + queue status
- Prometheus metrics endpoint; Celery inspect ping healthcheck; container healthchecks on every service