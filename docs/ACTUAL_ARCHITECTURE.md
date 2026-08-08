# WorkMesh AI — Actual Architecture (Forensic Baseline)

**Audit date:** 2026-08-08
**Source of truth:** repository code + Docker runtime observation. Not based on prior agent claims.

---

## 1. System Topology

```text
┌─────────────┐     ┌──────────────────────┐
│ Next.js Web │────▶│ FastAPI (/api/v1)    │
│ :3000       │  WS │ :8000 (BROKEN — P0)  │
└─────────────┘     └──────┬───────┬───────┘
                           │       │
                ┌──────────▼──┐ ┌──▼────────────┐
                │ PostgreSQL  │ │ Redis (0/1/2) │
                │ :5432 (009) │ │ :6379         │
                └─────────────┘ └──┬────────────┘
                                   │ broker/result
                         ┌─────────▼──────────┐
                         │ Celery worker+beat │
                         │ (jobs sync 6h)     │
                         └────────────────────┘
┌─────────────┐   ┌──────────────┐   ┌────────────────┐
│ Keycloak    │   │ MinIO (S3)   │   │ External job   │
│ :8080  OIDC │   │ :9000 resumes│   │ APIs (5 srcs)  │
│ realm:kc    │   └──────────────┘   └────────────────┘
└─────────────┘
```

## 2. Services Actually Running (docker compose)

| Service | Image base | Port | Status |
|---|---|---|---|
| postgres | postgres:16-alpine | 5432 | healthy |
| redis | redis:7-alpine | 6379 | healthy |
| minio | minio/minio | 9000/9001 | healthy |
| minio-init | minio/mc | — | one-shot (done) |
| keycloak | quay.io/keycloak/keycloak:24 | 8080 | healthy (realm imported) |
| api | python:3.11-slim | 8000 | **unhealthy (P0 import crash)** |
| web | node:22-alpine (Next 16) | 3000 | running (HTTP 200) |
| celery-worker | same as api | — | ready |
| celery-beat | same as api | — | running |

## 3. Monorepo Layout (turbo)

```text
apps/api      FastAPI  + Async SQLAlchemy 2.x + Alembic (22 migrations) + Celery
apps/web      Next.js 16 (app router) + React 19 + TanStack Query + Axios + Tailwind 4
packages/     config, shared, ui (low usage)
infra/docker  docker-compose.yml + init SQL
infra/keycloak realm JSON
infra/monitoring  prometheus/loki configs — NOT wired into compose
infra/traefik     configs — NOT wired into compose
tests/e2e     Playwright spec — not executed
docs/         30+ markdown (historically overstated)
```

## 4. Backend Domain Modules (apps/api/app)

| Domain | Responsibility | Migrations |
|---|---|---|
| auth | local JWT register/login/logout, roles, deps | 001, 002, 004 |
| engineers | profile, resume, skills | 001, 003 |
| companies | company profile/verification | 001 |
| jobs | CRUD, search, aggregation | 001, 005, 007 |
| saved_jobs | save job | 005 |
| applications | apply + status | 005 |
| matching | scores, recommendations | 001 (job_matches) |
| network | connections, conversations, messages, WS | 008 |
| notifications | in-app notification | 006 |
| projects | projects, milestones, tasks, comments | 006, 009, 010 |
| marketplace | task offers/assignment | 011 |
| quality | submissions, AI eval | 012 |
| payments | sandbox ledger-tx + work ledger | 013, 014 |
| contracts | contracts + milestones | 020 |
| trust | verifications, trust scores | 021 |
| social | posts, likes, comments | 019 |
| groups | groups, memberships | 022 |
| admin | stats, users, jobs, health, moderation, logs | 002, 016 |
| search | search endpoint | none (uses query filters) |

**Migrations NOT applied to live DB:** 010–022 (13 migrations; alembic at 009).

## 5. AI Layer (apps/api/app/agents + services/ai)

- Single chain: Agent → `AIService.analyze()` → `LLMClient.complete_structured_json()` → `litellm.acompletion()`.
- Provider: `AI_PROVIDER` (default `ollama`), model default `qwen2.5`, fallback list `AI_FALLBACK_PROVIDERS` default `ollama/qwen2.5`.
- Ollama default localhost:11434 → **zero-cost capable.**
- Groq/OpenAI optional via keys.
- Hardcoded/rule-based fallback when LLM call fails (quality engine).
- External API keys: optional. Local Ollama = full operation without keys.

## 6. Background Jobs (Celery)

- `sync_all_sources` (queue `jobs`) — every 6h (crontab `0 */6 * * *`) → 5 job aggregators × 50 jobs.
- `sync_source` — per-source trigger.
- `refresh_trending_skills` — every 12h.
- Other daily task at 2am.

## 7. Job Aggregation Adapters

`app/domains/jobs/aggregators/`: `base.py` (abstract, clean_text, extract_skills), `remoteok.py`, `arbeitnow.py`, `remotive.py`, `themuse.py`, `usajobs.py`. All external HTTP (Async) with normalization + dedup by source/url; persisted via JobRepository. **Actual live API success not yet verified.**

## 8. Frontend Routes (25+, all API-connected except landing)

Static: `/` (marketing).
Auth: `/auth/login`, `/auth/register`.
Engineer: `/engineer/dashboard`, `/engineer/profile`, `/engineer/applications`, `/engineer/recommendations`, `/engineer/workspace`, `/workspace`.
Company: `/company/dashboard`, `/company/jobs`, `/company/profile`, `/company/candidates`.
Jobs: `/jobs`, `/jobs/[id]`, `/jobs/new`.
Network/Social: `/network`, `/feed`, `/groups`, `/messages`.
Projects/Contracts/Payments: `/projects`, `/projects/[id]`, `/contracts`, `/contracts/[id]`, `/payments`, `/quality`.
Discovery: `/engineers`, `/engineers/[id]`, `/freelancers`, `/companies`, `/companies/[id]`.
Admin: `/admin/dashboard`.

**WebSocket client:** `src/hooks/useMessages.ts` → `ws://…/api/v1/messages/ws/{id}?token=…` with HTTP fallback.

## 9. Key Architectural Caveats

1. API **does not start** — `groups/router.py` imports `get_current_user` from wrong module (P0).
2. DB **13 migrations behind** — feature tables for 010+ absent.
3. Payments = **sandbox only** (intentional).
4. Keycloak = **configured but not the API auth path** (local JWT is).
5. Monitoring/traefik configs exist but are **not part of compose**.
6. Local `.venv` empty (no Python deps installed with it — Docker is the effective runtime for dev).