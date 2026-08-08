# WorkMesh AI — Actual Architecture (Forensic)

> Commit audited: `da4534e98b282ab9f734d1daf60b2f040ee59513` (branch `main`, clean)
> Audit date: 2026-08-08

## 1. Repository Layout
- **apps/api** — FastAPI (Python 3.11 in Docker, async SQLAlchemy 2.x, Alembic, Celery)
- **apps/web** — Next.js 16.2.11 (app router, React 19, TanStack Query, axios, Tailwind 4)
- **packages/** — config, shared, ui (referenced; minimal usage)
- **infra/docker** — docker-compose (9 services); **infra/keycloak** — realm import
- **infra/monitoring** — Prometheus + Loki configs (**NOT in compose**)
- **infra/traefik** — configs (**NOT in compose**)
- **tests/e2e** — Playwright spec (present, **not executed**)

## 2. Backend Architecture
19 domain routers: admin (dashboard + moderation_router), applications, auth, companies, contracts, engineers, groups, jobs, marketplace, matching, network, notifications, payments, projects, quality, saved_jobs, search, social, trust.
~148 API endpoints registered; all routers use `require_role(...)` RBAC.

| Layer | Location | Notes |
|---|---|---|
| Routers | `app/domains/*/router.py` | FastAPI APIRouter |
| Services | `app/domains/*/service.py` | Business logic |
| Models | `app/domains/*/models.py` | SQLAlchemy 2.x mapped classes |
| Schemas | `app/domains/*/schemas.py` | Pydantic |
| Auth deps | `app/domains/auth/dependencies.py` | `get_current_user`, `require_role` |
| Core | `app/core/` | config, database, security (uploads), storage (MinIO), cache, health, middleware, metrics, queue_monitor |
| Agents | `app/agents/` | quality_engine.py, resume_parser.py, job_enricher.py, llm_client.py, model_config.py |
| Services | `app/services/` | ai/, notifications/, payments/ |
| Workers | `app/workers/` | Celery (queues: default, jobs, ai, matching; beat PersistentScheduler) |
| Scripts | `app/scripts/seed_data.py` | Contains `DEMO_JOBS_SEED` fixture |
| Jobs aggregators | `app/domains/jobs/aggregators/` | arbeitnow, remoteok, remotive, themuse, usajobs |

## 3. Frontend Architecture
- **API client** `lib/api.ts`: axios baseURL `${NEXT_PUBLIC_API_URL || http://localhost:8000}/api/v1`; JWT from `localStorage`; refresh interceptor (`/auth/refresh`, one retry).
- **Hooks** (24): `useJobs, useApplications, useConnections, useMessages (WS), useProjects, useProject, useWorkerWorkspace, useContracts, usePayments, useTrust, useQuality, useGroups, useFeed, useNotifications, useRecommendations, useSavedJobs, useFreelancers, useCompanyJobs, useCompanyProfile, useCreateJob, useCandidateMatches, useProfileAssistant`, etc. — **85 `api.*` calls, all targeting real backend endpoints.**
- **Components** (12): `QueryProvider`, `RequireRole`, `LayoutShell`, `Sidebar`, `TopNavbar`, `TrustBadge`, `RightSidebar`, etc.
- **WebSocket**: `useMessages` → `ws://host/api/v1/conversations/{id}/messages/ws?token=…` (reconnect on close).
- **Routes** (34): `/`, `/auth/login|register`, `/admin/dashboard`, `/companies`, `/company/{dashboard,jobs,candidates,profile}`, `/contracts`, `/engineer/{dashboard,profile,applications,recommendations,workspace}`, `/engineers`, `/feed`, `/freelancers`, `/groups`, `/jobs`, `/jobs/new`, `/messages`, `/network`, `/payments`, `/projects`, `/quality`, `/workspace` + dynamic `[id]` routes.

## 4. Database Architecture
Migration chain `001_initial_schema → 022_groups` (22 Alembic revisions).

| State | Revision |
|---|---|
| Repository head | `022_groups` |
| **Live database** | **`009_project_management` (13 behind)** |

Live tables (25): activity_logs, ai_reports, alembic_version, api_sync_logs, company_profiles, connections, conversations, engineer_profiles, job_applications, job_matches, job_posts, job_skills, messages, milestones, notifications, project_activity, project_members, project_tasks, projects, recommendations, saved_jobs, skills, task_comments, user_skills, users.

Missing tables (18) from migrations 010–022: task_dependencies, task_assignment_offers, work_submissions, work_ledger_entries, payment_transactions, project_reviews, moderation_reports, ai_usage_logs, posts, post_likes, post_comments, contracts, contract_milestones, user_verifications, user_trust_scores, groups, group_memberships, group_posts.

## 5. Infrastructure (docker-compose)
| Service | Image | Ports | Healthcheck |
|---|---|---|---|
| postgres | postgres:16-alpine | 5432 | pg_isready |
| redis | redis:7-alpine | 6379 | redis-cli ping |
| minio | minio/minio | 9000/9001 | /minio/health/live |
| minio-init | minio/mc (one-shot) | — | n/a (buckets: resumes private, assets public) |
| keycloak | quay.io/keycloak:24.0 | 8080 | GET /health/ready, realm import |
| api | built (dev target) | 8000 | /api/v1/health |
| web | built | 3000 | **none** |
| celery-worker | built (dev target) | — (8000 exposed) | none |
| celery-beat | built (dev target) | — | none |

Network `remote_ai_platform`; volumes postgres_data, redis_data, minio_data, keycloak_data.

## 6. AI Provider Chain
```
Frontend hook → API router → service → agent → LLMClient (litellm.acompletion)
→ primary: ollama/qwen2.5 @ http://host.docker.internal:11434 (no Ollama container in compose)
→ fallback chain: AI_FALLBACK_PROVIDERS; groq/ → GROQ_API_KEY; openai/ → OPENAI_API_KEY
```
Runtime: **NOT VERIFIED** — no provider reachable; API down.

## 7. Payments Architecture
- **No real payment provider** (no Stripe/processor found).
- `PaymentTransaction` ledger + escrow endpoints explicitly named `sandbox`.
- Ledger entries via `work_ledger`; escrow release/refund mutate ledger state only.
- Classification: **MOCK_OR_SANDBOX**.

## 8. Security Architecture (static)
- RBAC: `require_role(ENGINEER|COMPANY|ADMIN)` on all routers; admin router admin-only.
- JWT access+refresh with expiry; password hashing (`get_password_hash`).
- Upload validation: extension, content-type, ≤5 MB, magic bytes (PDF `%PDF`, DOCX `PK`); private MinIO object names.
- WebSocket auth: token query param, 4401 close, membership check.
- CORS: `http://localhost:3000` only.
- Dev-mock fallback: `DEBUG=True` creates dev mock user (dev-only).
- Defaults in compose are dev-only secrets (`dev_secret_key_change_in_prod` etc.).

## 9. Gaps Between Documented and Actual
| Doc-aware claim | Actual |
|---|---|
| Monitoring (Prometheus/Loki) | Configs exist; **no containers** in compose |
| Traefik | Configs exist; **no container** in compose |
| Web service healthcheck | **Missing** |
| API container | Crash-loops (P0 ImportError `groups/router.py:16`) |
| Keycloak | Container healthy; **NOT wired into API auth** (local JWT first) |
| Live DB | 13 migrations behind repo head (010–022 not applied) |
| Tests | 23 files; **0 executed** (conftest blocked by P0) |
| Payments | Sandbox ledger only — **not real money movement** |