# WorkMesh AI — Current State Assessment
> **Last updated**: 2026-08-08 by Antigravity (Google DeepMind)
> **Repository**: `gokul-227/remote-ai-platform`
> **Branch**: `main` — clean working tree (3 commits total)

---

## 1. Executive Summary

The repository is a **well-structured MVP foundation** built across multiple AI sessions (Codex, Claude).
The monorepo uses Turborepo with two apps: `apps/api` (FastAPI) and `apps/web` (Next.js 16 / React 19).
The codebase is significantly more complete than most early MVPs, but several domains are
**backend-only with no connected frontend**, and the overall product journey is not yet end-to-end
usable.

**Git state**: 3 commits on `main`. Working tree is clean.
**Docker access**: Docker socket not accessible in this agent session — UI/Docker verification deferred.
**Python env**: Host Python is 3.14 (incompatible with pyproject requirement of >=3.11). Run via Docker.

---

## 2. Domain Gap Matrix

| Domain | Backend | Frontend | DB/Migrations | Tests | Status |
|---|---|---|---|---|---|
| **Auth** | ✅ DONE | ✅ DONE | ✅ DONE | ✅ DONE | COMPLETE |
| **Engineer Profiles** | ✅ DONE | ✅ DONE | ✅ DONE | ✅ DONE | COMPLETE |
| **Company Profiles** | ✅ DONE | ✅ DONE | ✅ DONE | ✅ DONE | COMPLETE |
| **Job Aggregation** | ✅ DONE | ✅ DONE | ✅ DONE | ✅ DONE | COMPLETE |
| **Job Search/Browse** | ✅ DONE | ✅ DONE | ✅ DONE | ✅ DONE | COMPLETE |
| **AI Matching** | ✅ DONE | ⚠️ PARTIAL | ✅ DONE | ✅ DONE | PARTIAL |
| **Applications** | ✅ DONE | ✅ DONE | ✅ DONE | ✅ DONE | COMPLETE |
| **Saved Jobs** | ✅ DONE | ✅ DONE | ✅ DONE | — | COMPLETE |
| **Professional Network** | ✅ DONE | ⚠️ PARTIAL | ✅ DONE | ✅ DONE | PARTIAL |
| **Messaging (WebSocket)** | ✅ DONE | ⚠️ PARTIAL | ✅ DONE | ❌ MISSING | PARTIAL |
| **Notifications** | ✅ DONE | ⚠️ PARTIAL | ✅ DONE | — | PARTIAL |
| **Projects** | ✅ DONE | ⚠️ PARTIAL | ✅ DONE | ✅ DONE | PARTIAL |
| **Milestones/Tasks** | ✅ DONE | ❌ MISSING | ✅ DONE | ✅ DONE | PARTIAL |
| **Work Dispatch (Uber)** | ✅ DONE | ✅ DONE | ✅ DONE | ⚠️ PARTIAL | COMPLETE |
| **Work Submissions/Review** | ✅ DONE | ✅ DONE | ✅ DONE | ⚠️ PARTIAL | COMPLETE |
| **Contracts** | ✅ DONE | ✅ DONE | ✅ DONE | ✅ DONE | COMPLETE |
| **Payments (abstraction)** | ✅ DONE | ✅ DONE | ✅ DONE | ✅ DONE | COMPLETE |
| **Work Ledger** | ✅ DONE | ✅ DONE | ✅ DONE | — | COMPLETE |
| **Trust/Reputation** | ✅ DONE | ✅ DONE | ✅ DONE | ✅ DONE | COMPLETE |
| **Social Feed (Posts)** | ✅ DONE | ✅ DONE | ✅ DONE | ✅ DONE | COMPLETE |
| **Groups** | ✅ DONE | ✅ DONE | ✅ DONE | ✅ DONE | COMPLETE |
| **Freelancer Discovery** | ⚠️ PARTIAL | ✅ DONE | ✅ DONE | — | PARTIAL |
| **Admin Console** | ✅ DONE | ✅ DONE | ✅ DONE | ✅ DONE | COMPLETE |
| **AI (Resume Parser)** | ✅ DONE | ✅ DONE | ✅ DONE | ✅ DONE | COMPLETE |
| **AI (Job Enricher)** | ✅ DONE | — | ✅ DONE | ✅ DONE | COMPLETE |
| **AI (Project Planner)** | ✅ DONE | ⚠️ PARTIAL | ✅ DONE | ✅ DONE | PARTIAL |
| **AI (Quality Engine)** | ✅ DONE | ✅ DONE | — | ✅ DONE | COMPLETE |
| **Search (full-text)** | ✅ DONE | ✅ DONE | ✅ DONE | — | COMPLETE |
| **Observability (Prometheus)** | ✅ DONE | — | — | ⚠️ PARTIAL | COMPLETE |
| **Docker Infrastructure** | ✅ DONE | ✅ DONE | — | — | COMPLETE |
| **Keycloak (IdP)** | ✅ DONE | ❌ MISSING | — | — | PARTIAL |
| **MinIO (Storage)** | ✅ DONE | ⚠️ PARTIAL | — | — | PARTIAL |
| **Celery Workers** | ✅ DONE | — | — | ✅ DONE | COMPLETE |
| **CI/CD (GitHub Actions)** | ✅ DONE | ✅ DONE | — | — | COMPLETE |
| **Seed Data / Demo Users** | ❌ MISSING | — | — | — | MISSING |
| **E2E Tests** | ❌ MISSING | ❌ MISSING | — | — | MISSING |

---

## 3. What EXISTS and What the Code Actually Does

### Auth (`apps/api/app/domains/auth/`)
- **Model**: `User` with fields: `keycloak_id`, `email`, `full_name`, `role` (ENGINEER/COMPANY/ADMIN), `password_hash`, `avatar_url`, `is_active`
- **Router**: `/api/v1/auth/` — register, login (JSON + form), refresh, logout, `/me`, `/sync`, `/login-url`, `/logout-url`, `/role` (PATCH)
- **Auth mechanism**: Custom JWT (HS256) with `JWT_SECRET_KEY` — Keycloak OIDC integration exists in `AuthService` but frontend uses direct JWT login flow (not OIDC redirect)
- **Frontend**: Login page, Register page — fully functional

### Engineer Profiles (`apps/api/app/domains/engineers/`)
- Full CRUD, profile completeness score (`_recalculate_score`)
- Resume upload to MinIO → AI parsing via `ResumeParserAgent`
- Skills, portfolio, experience, education, avatar

### Company Profiles (`apps/api/app/domains/companies/`)
- Company creation, tech stack, industry, size, verification status
- Application review (shortlist/reject) from company side

### Job Aggregation (`apps/api/app/domains/jobs/`)
- 5 aggregators: RemoteOK, Remotive, Arbeitnow, USAJobs, TheMuse
- Sync engine, dedup, Celery beat (every 6h), sync logs
- `POST /api/v1/jobs/seed_demo` for seeding

### AI Layer (`apps/api/app/agents/`, `apps/api/app/services/ai/`)
- `LLMClient` → LiteLLM → multiple provider support (Ollama, Groq, OpenAI-compatible)
- `ResumeParserAgent` — extracts structured data from resume text
- `JobEnricherAgent` — enriches job descriptions with structured metadata
- AI Project Planner integrated in projects router
- Fallback providers configured

### Matching (`apps/api/app/domains/matching/`)
- Multi-factor explainable scoring: skills, experience, role type, timezone, compensation
- Match scores stored in `match_scores` table
- Frontend partially shows match pill

### Network (`apps/api/app/domains/network/`)
- Connections: send/accept/reject/block/remove
- WebSocket-based messaging in same router
- Conversations and Messages persisted in PostgreSQL

### Applications (`apps/api/app/domains/applications/`)
- Full lifecycle with state machine: SUBMITTED→REVIEWING→SHORTLISTED→ACCEPTED/REJECTED/WITHDRAWN
- Company can manage applications on their jobs

### Projects Domain (`apps/api/app/domains/projects/`)
- `Project`, `Milestone`, `ProjectTask`, `TaskAssignmentOffer`
- `WorkSubmission`, `WorkLedgerEntry`, `PaymentTransaction`, `ProjectReview`, `ProjectActivity`
- AI project plan generator endpoint
- Work dispatch: offer to engineers, accept/reject
- Sandbox payment provider

### Docker Infrastructure (`infra/docker/docker-compose.yml`)
- Services: postgres, redis, minio, keycloak, api, web, celery-worker, celery-beat
- Health checks on all infra services
- Named volumes for persistence
- MinIO bucket init container
- Keycloak realm import

---

## 4. Known Bugs / Issues

| # | Issue | Location | Severity |
|---|---|---|---|
| 1 | `node_modules`, `.next`, `.venv*`, `.turbo`, `.pytest_cache`, `celerybeat-schedule` committed to repo | root/apps | Medium |
| 2 | `RateLimitMiddleware` is a passthrough stub | `app/core/middleware.py` | Medium |
| 3 | Auth tokens stored in localStorage (XSS risk) | `apps/web/src/lib/auth.tsx` | Medium |
| 4 | `budget` (Project) uses `Float` (not integer minor units) | `projects/models.py:L22` | Medium |
| 5 | `amount` (PaymentTransaction) uses `Float` | `projects/models.py:L125` | Medium |
| 6 | `ProjectTask` model defined in `marketplace/models.py` (imported elsewhere) — duplication confusion | `marketplace/models.py:L32` | Low |
| 7 | Projects router defines schemas inline instead of in `schemas.py` | `projects/router.py` | Low |
| 8 | No seed scripts — `CLAUDE.md` documents references are stale | — | Low |
| 9 | E2E test directory `tests/e2e/` exists but is empty | `tests/e2e/` | Low |
| 10 | WebSocket messaging tests completely missing | `apps/api/tests/` | Medium |
| 11 | Frontend Keycloak OIDC redirect flow not implemented | `apps/web` | Low |

---

## 5. API Routes Inventory

| Method | Path | Auth |
|---|---|---|
| POST | /api/v1/auth/register | None |
| POST | /api/v1/auth/login | None |
| POST | /api/v1/auth/refresh | None |
| POST | /api/v1/auth/logout | JWT |
| GET | /api/v1/auth/me | JWT |
| PATCH | /api/v1/auth/role | JWT |
| GET/POST/PATCH/DELETE | /api/v1/engineers/* | JWT |
| GET/POST/PATCH/DELETE | /api/v1/companies/* | JWT |
| GET/POST | /api/v1/jobs/* | mixed |
| GET | /api/v1/search/* | None |
| GET | /api/v1/matching/* | JWT |
| GET/POST/PATCH | /api/v1/applications/* | JWT |
| GET/POST | /api/v1/saved-jobs/* | JWT |
| GET/POST/PATCH/DELETE | /api/v1/projects/* | JWT |
| GET/POST/PATCH | /api/v1/notifications/* | JWT |
| GET/POST/PATCH/DELETE | /api/v1/connections | JWT |
| WS | /api/v1/ws/{user_id} | JWT |
| GET/POST | /api/v1/conversations/* | JWT |
| GET | /api/v1/admin/* | JWT+ADMIN |
| GET | /api/v1/health | None |
| GET | /metrics | None |

---

## 6. Frontend Routes Inventory

| Route | Status |
|---|---|
| `/` | ✅ |
| `/auth/login` | ✅ |
| `/auth/register` | ✅ |
| `/jobs`, `/jobs/[id]`, `/jobs/new` | ✅ |
| `/engineers`, `/engineers/[id]` | ✅ |
| `/companies`, `/companies/[id]` | ✅ |
| `/freelancers` | ✅ |
| `/engineer/dashboard` | ✅ |
| `/engineer/profile` | ✅ |
| `/engineer/applications` | ✅ |
| `/engineer/recommendations` | ⚠️ Partial |
| `/company/dashboard` | ✅ |
| `/company/profile` | ✅ |
| `/company/jobs` | ✅ |
| `/company/candidates` | ✅ |
| `/network` | ⚠️ Partial |
| `/messages` | ⚠️ Partial |
| `/projects`, `/projects/[id]` | ⚠️ Partial |
| `/admin/dashboard` | ⚠️ Partial |
| `/feed` | ❌ MISSING |
| `/groups` | ✅ |
| `/workspace` (task execution UI) | ❌ MISSING |

---

## 7. Recommended Next Actions (Priority Order)

1. **Fix .gitignore** — prevent re-committing `node_modules`, `.next`, `.venv*` etc.
2. **Social Feed** — build `/feed` page with post creation, like, comment
3. **Worker Workspace** — build task acceptance/progress/submission UI
4. **Contracts domain** — proper contract lifecycle
5. **Real rate limiting** — replace stub middleware with Redis-backed limiting
6. **WebSocket messaging tests** — add integration tests for chat
7. **E2E tests** — implement critical user journeys

## 8. Technology Stack (Verified from Source)

| Layer | Technology | Version |
|---|---|---|
| Frontend | Next.js | 16.2.11 |
| Frontend | React | 19.2.4 |
| Frontend | TailwindCSS | v4 (CSS-first `@import "tailwindcss"`) |
| Frontend | TanStack Query | ^5 |
| Backend | FastAPI | 0.115.5 |
| Backend | Python | 3.11 (required, host is 3.14 — use Docker) |
| Backend | SQLAlchemy | 2.0.36 (async) |
| Backend | Alembic | 1.14.0 |
| Backend | Celery | 5.4.0 |
| Backend | LiteLLM | 1.55.2 |
| DB | PostgreSQL | 16 |
| Cache | Redis | 7 |
| Storage | MinIO | latest |
| Identity | Keycloak | 24.0 |
| AI default | Ollama / Groq | qwen2.5 / llama-3.1-8b-instant |
| Monorepo | Turborepo | npm workspaces |
