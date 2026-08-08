# WorkMesh AI Engineering State

## Product Vision
WorkMesh AI is an AI-powered global remote work and software-delivery ecosystem connecting remote engineers and client companies. It combines concepts from LinkedIn (networking), Upwork (freelance marketplace), Uber (work dispatch), and modern AI project management tools.

## Current Architecture
Modular Monolith: Next.js 16 App Router frontend (`apps/web`) communicates via REST and WebSockets with a FastAPI backend (`apps/api`). Asynchronous background jobs, job aggregation, and AI tasks are handled by Celery + Redis. Data is stored in PostgreSQL 16; files are stored in MinIO (S3-compatible). AI calls go through LiteLLM provider abstraction.

## Current Technology Stack
- **Frontend**: Next.js 16.2.11, React 19.2.4, TypeScript, Tailwind CSS v4, TanStack Query.
- **Backend**: FastAPI, Python 3.11, Async SQLAlchemy 2.0, Alembic, Pydantic v2, Celery 5.
- **Database & Cache**: PostgreSQL 16, Redis 7.
- **Storage & Auth**: MinIO, Keycloak (OIDC provisioned) / JWT Email-Password.
- **AI**: LiteLLM (Groq / Ollama / OpenAI / Gemini).

## Repository Structure
```
remote-ai-platform/
├── apps/
│   ├── api/             # FastAPI backend application
│   └── web/             # Next.js 16 frontend application
├── docs/                # Permanent engineering memory
├── infra/
│   └── docker/          # Docker compose setup
└── packages/            # Turborepo packages (config, shared, ui)
```

## Implemented Features
- User registration, login, JWT token pair generation, refresh token logic. Self-assign admin role blocked in `/api/v1/auth/register`.
- Engineer profiles, automatic completeness score calculation, resume file upload to MinIO, AI structured resume parsing via LiteLLM.
- Company profiles, company tech stack, company verification flags, company job management, role authorization (`COMPANY` / `ADMIN`).
- Multi-source job aggregation from 5 platforms (RemoteOK, Remotive, Arbeitnow, USAJobs, The Muse) with deduplication.
- Explainable AI matching engine evaluating skills, experience, role, timezone, compensation, and remote fit.
- Network connection requests, connection management, posts, comments, likes, feed.
- Real-time WebSocket messaging with PostgreSQL persistence.
- Project creation, milestone/task structure, natural language AI project plan generation.
- Admin platform statistics and job aggregator sync status endpoints.
- Jobs marketplace filters now work end-to-end for repeated skills and salary ranges; keyword search falls back to portable `ILIKE` matching outside PostgreSQL.
- Frontend build script updated in `apps/web/package.json` (`"build": "next build --webpack"`), compiling cleanly with 0 errors.

## Partially Implemented Features
- Explainable match detail in the company candidate workflow and automated talent ranking.
- Uber-style candidate ranking and task dispatch engine.
- Notification dispatching (DB schema migrated, Celery tasks partial).
- Admin UI console overview.

## Missing Features
- Work Ledger (effort accounting).
- Social Groups domain.
- Real Payment Provider Integrations (conceptual sandbox abstraction only).
- Frontend Automated Test Runner (Vitest/Playwright).

## Known Bugs
- None identified in the current validation scope.

## Technical Debt
- Local virtualenv wheel mismatch on Python 3.14 (use Docker or Python 3.11 for non-container backend dev).
- Frontend lacks automated test suite configuration.
- Job skill filters intentionally match any selected skill; add an all-skills mode only with an explicit product requirement.

## Database State
PostgreSQL 16 with 9 Alembic migrations applied up to `009_project_management.py`.

## API State
REST endpoints under `/api/v1/` with standard response envelopes (`success`, `data`, `message`, `pagination`). WebSocket mounted at `/api/v1/messages/ws`.

## Frontend State
Next.js 16 App Router with 21 compiled routes across engineer, company, admin, auth, jobs, messages, network, and project views. Build script verified with `npm run build` (`next build --webpack`).

## Authentication State
JWT bearer authentication active with roles (`ENGINEER`, `COMPANY`, `ADMIN`). Admin self-assignment blocked on registration. Company onboarding role-restricted.

## AI State
Provider-independent LiteLLM client in `apps/api/app/agents/llm_client.py`, with centralized model candidates in `app/agents/model_config.py`, versioned prompts in `app/services/ai/prompts.py`, and persisted execution metadata in `AIUsageLog`. Default provider: Ollama (`qwen2.5`); configured fallbacks are attempted in order.

## Job Aggregation State
5 adapters functional, Celery beat scheduled sync every 6 hours. Demo seeding available via `POST /api/v1/jobs/seed_demo`.

## Background Worker State
Celery 5 worker and beat running with 4 queues (`default`, `jobs`, `ai`, `matching`).

## Admin State
Backend stats router registered; frontend admin dashboard route `/admin/dashboard` active.

## Testing State
Backend tests run through the API Docker image: 22 passed. Frontend lint/build pass; lint emits one existing React Hook Form compiler warning.

## Deployment State
Docker Compose (`infra/docker/docker-compose.yml`) orchestrates 9 services locally. Production deployment target: Vercel (Web) + Render/Fly.io (API) + Neon/Supabase (Postgres).

## Security State
Server-side authorization enforced on domain routers. Self-assign admin role blocked. Company profile creation restricted to COMPANY/ADMIN roles.

## Current Sprint
Phase B — Batch Implementations.

## Current Batch
Batch 31 — Deployment (COMPLETE).

## Completed Batches
- Batch 0 — Forensic Audit & Memory Creation.
- Batch 1 — Foundation Hardening.
- Batch 2 — Identity & Onboarding.
- Batch 3 — Professional Profile System.
- Batch 4 — Jobs Marketplace & Search.
- Batch 9 — Job Applications.
- Batch 10 — Company Talent Discovery.
- Batch 8 — AI Job Matching.
- Batch 15 — Company Project Creation.
- Batch 16 — Project Workspace.
- Batch 17 — AI Project Manager.
- Batch 18 — Worker Task Assignment.
- Batch 19 — Work Submission & Review.
- Batch 20 — Work Ledger.
- Batch 21 — Payment Abstraction.
- Batch 22 — Reputation.
- Batch 23 — Notification Platform.
- Batch 24 — Admin Console.
- Batch 25 — Moderation & Trust.
- Batch 26 — AI Platform.
- Batch 27 — Observability.
- Batch 28 — Security Hardening.
- Batch 29 — Performance.
- Batch 30 — E2E Testing.
- Batch 31 — Deployment.

## In Progress
- Project workspace: milestones, tasks, assignment fields, activity, delivery state, dependency visibility, and completion guards.
- AI project manager: progress summaries, delivery risk analysis, report persistence, and workspace review controls.
- Worker task assignment: qualified offers, acceptance/decline/cancellation lifecycle, assignment, and project enrollment.
- Work submission and review: versioned submissions, artifact references, reviewer decisions, revision cycles, and AI quality feedback.
- Work ledger: non-financial effort entries, task/submission linkage, project totals, and auditable voiding.
- Payment abstraction: provider-neutral payment, escrow, and payout boundaries with sandbox-only escrow, release, and refund transitions.
- Reputation: completed-project reciprocal reviews, duplicate safeguards, rating averages, completion rates, and explainable trust factors.
- Notification platform: provider-independent in-app delivery, unread counts, per-item read state, mark-all-read, and project event notifications.
- Admin console: platform metrics, sync/source health, user status controls, job status controls, and audit-log visibility.
- Moderation and trust: authenticated user/job reporting, admin moderation queue, audited hide-job and suspend-user actions, and dismissal decisions.

## Blocked
- Host Python 3.14 environment lacks pytest; use the API Docker image for backend validation.

## Next Recommended Batch
**Continue with Batch 32 / PRODUCTION READINESS** by completing environment, CI/CD, backup, and release checks.

## Important Architectural Decisions
- ADR 001: Modular Monolith over Microservices.
- ADR 002: LiteLLM Provider Abstraction.
- ADR 003: Enterprise Tailwind v4 Styling with Webpack build mode.
- ADR 004: Free-First S3 & Open-Source Infra.

## Do Not Change
- Do not split `apps/api` into microservices.
- Do not bypass LiteLLM for direct OpenAI/Anthropic SDK imports.
- Do not delete existing Alembic migrations.

## Known Limitations
- Aggregator sync schedules must respect upstream rate limits.

## Last Agent Summary
- **Date**: August 8, 2026
- **Batch**: Batch 24 (Admin Console)
- **What was implemented**:
  - Added company/admin project brief creation UI.
  - Changed AI planning into a reviewable draft; generated milestones/tasks are not materialized before approval.
  - Added explicit `approve-plan` endpoint that activates the project and materializes the approved plan.
  - Added project detail plan review and approval controls.
  - Added approval-gate regression coverage.
- Added task dependency storage, same-project validation, dependency-aware completion guards, and dependency activity records.
- Added workspace status controls, dependency creation UI, and prerequisite visibility.
- **Database changes**: Added Alembic migration `010_task_dependencies`.
- Added project manager progress-summary and risk-analysis review controls using the existing provider-neutral AI service.
- Added regression coverage for report generation, persistence, and retrieval.
- Added task assignment offers with skill qualification and open-to-work checks.
- Added offer acceptance/decline/cancellation transitions; acceptance assigns the task, enrolls the worker, and cancels competing offers.
- Added company offer controls and engineer offer inbox controls.
- **Database changes**: Added Alembic migration `011_task_assignment_offers`.
- Added versioned work submissions with artifact URL references and assigned-worker authorization.
- Added company review transitions for requested changes and approval, including task completion on approval.
- Added provider-neutral AI quality review with persisted score and feedback.
- Added worker submission and company review controls in the project workspace.
- **Database changes**: Added Alembic migration `012_work_submissions`.
- Added non-financial work ledger entries measured in minutes and linked to assigned tasks and submissions.
- Enforced positive duration, assigned-worker ownership, submission ownership, and company/admin voiding invariants.
- Added project ledger totals, per-worker totals, recent-entry workspace view, and audit activity records.
- **Database changes**: Added Alembic migration `013_work_ledger`.
- Added provider-neutral `PaymentProvider`, `EscrowProvider`, and `PayoutProvider` protocols.
- Added deterministic `SandboxPaymentProvider`; no payment network or real funds are accessed.
- Added project-scoped escrow, release, refund, duplicate-active-escrow protection, and payment visibility endpoints.
- Added sandbox payment controls to the project workspace.
- **Database changes**: Added Alembic migration `014_payment_abstraction`.
- Added reciprocal completed-project reviews with one-review-per-participant safeguards.
- Added reputation summaries with average rating, rating count, task completion rate, trust score, and explainable factors.
- Added project workspace review form and review history.
- **Database changes**: Added Alembic migration `015_project_reputation`.
- Added provider-independent `NotificationProvider`, in-app adapter, and email adapter boundary without external email delivery.
- Wired task offers, work submissions/reviews, project reviews, and payment changes into in-app notifications.
- Added unread count, per-notification read, and mark-all-read API/UI behavior.
- **Database changes**: None; existing notifications table from migration `006_projects_notifications` was reused.
- **Tests**: Full API suite — 28 passed; project-management suite — 6 passed; frontend lint/build passed with one existing warning.
- Added admin activity-log endpoint and audited user status changes.
- Added admin job active/inactive control endpoint.
- Expanded admin console UI with user controls, source health, and recent audit activity.
- **Database changes**: None; existing admin activity and sync log tables were reused.
- **Tests**: Full API suite — 29 passed; admin console regression — 1 passed; frontend lint/build passed with one existing warning.
- **Known issues**: AI plan generation still requires a configured provider; the draft remains safely unactivated when unavailable. Host Python 3.14 still requires Docker for pytest.

- **Date**: August 8, 2026
- **Batch**: Batch 25 (Moderation & Trust)
- **What was implemented**:
  - Added authenticated reporting for user and job targets with duplicate-open-report protection.
  - Added admin moderation queue and audited decisions for dismissing reports, hiding jobs, and suspending users.
  - Expanded the admin dashboard with moderation actions, user controls, and recent audit activity.
- **Database changes**: Added Alembic migration `016_moderation_reports`.
- **Tests**: Full API suite — 29 passed; admin/moderation regression — 1 passed; frontend lint/build passed with one existing warning.
- **Known issues**: AI plan generation still requires a configured provider; host Python 3.14 still requires Docker for pytest.
- **Next recommended action**: Begin Batch 26 with centralized AI platform configuration.

- **Date**: August 8, 2026
- **Batch**: Batch 26 (AI Platform)
- **What was implemented**:
  - Centralized primary/fallback model candidate resolution while retaining LiteLLM as the provider boundary.
  - Captured provider model, token usage, latency, and failure metadata from completion responses.
  - Added versioned prompt templates and persisted `AIUsageLog` execution records when a database session is supplied.
- **Database changes**: Added Alembic migration `017_ai_usage_logs`.
- **Tests**: AI provider/platform tests — 5 passed; Python compile checks passed.
- **Known issues**: AI provider availability remains environment-dependent; no provider credentials or local Ollama model are bundled.
- **Next recommended action**: Begin Batch 27 with observability instrumentation.

- **Date**: August 8, 2026
- **Batch**: Batch 27 (Observability)
- **What was implemented**:
  - Added HTTP request counters tied to existing request IDs and structured completion logs.
  - Added Celery task outcome and duration metrics for the configured queues.
  - Added Redis-backed queue-depth gauges plus `/api/v1/health/queues` and health service reporting.
- **Database changes**: None.
- **Tests**: Full API suite — 32 passed; observability metric checks and Python compile checks passed.
- **Known issues**: Queue depth is best-effort and reports degraded state when the broker is unavailable; Prometheus scraping remains deployment-dependent.
- **Next recommended action**: Begin Batch 28 with security hardening.

- **Date**: August 8, 2026
- **Batch**: Batch 28 (Security Hardening)
- **What was implemented**:
  - Installed sensitive-route sliding-window rate limiting for authentication and resume uploads.
  - Added private randomized resume object keys, size limits, extension/content validation, and traversal-safe handling.
  - Preserved inactive-account 403 responses and closed task-level project access gaps for ledger and submission flows.
- **Database changes**: None.
- **Tests**: Full API suite — 34 passed; security/auth regression — 6 passed; Python compile checks passed.
- **Known issues**: The limiter is process-local; a shared Redis limiter is still required for multi-instance production deployment.
- **Next recommended action**: Begin Batch 29 with performance profiling and index review.

- **Date**: August 8, 2026
- **Batch**: Batch 29 (Performance)
- **What was implemented**:
  - Added composite indexes for active job feeds, applications, notifications, project membership/tasks, offers, and activity timelines.
  - Added a short-TTL Redis cache for public job search keyed by the complete normalized filter set.
  - Kept cache failures best-effort so database reads remain the correctness path.
- **Database changes**: Added Alembic migration `018_performance_indexes`.
- **Tests**: Full API suite — 35 passed; performance/job regression — 5 passed; Python compile checks passed.
- **Known issues**: Cache invalidation is TTL-based and the frontend still lacks an automated performance budget.
- **Next recommended action**: Begin Batch 30 with end-to-end persona journeys.

- **Date**: August 8, 2026
- **Batch**: Batch 30 (E2E Testing)
- **What was implemented**:
  - Added an executable Worker/Company marketplace journey covering registration, profile creation, application submission, company visibility, and review.
  - Added an executable Admin journey covering user listing, suspension enforcement, and audit-log verification.
  - Kept the journeys on the real FastAPI HTTP boundary using the Docker-backed test environment.
- **Database changes**: None.
- **Tests**: Full API suite — 37 passed; E2E persona journeys — 2 passed; frontend build passed.
- **Known issues**: Browser-level Playwright/Cypress automation is not yet installed; current E2E coverage is API/integration-level.
- **Next recommended action**: Begin Batch 31 with deployment topology validation.

- **Date**: August 8, 2026
- **Batch**: Batch 31 (Deployment)
- **What was implemented**:
  - Validated the Vercel frontend, Render API, Neon/Supabase PostgreSQL, managed Redis, S3-compatible storage, and Keycloak topology contract.
  - Added production startup migration execution via `apps/api/start-production.sh`.
  - Added fail-fast rejection of known development secrets when `APP_ENV=production`.
  - Documented post-deployment health, queue, migration, and frontend/API verification steps.
- **Database changes**: No new schema migration; production startup now applies migrations through Alembic.
- **Tests**: Deployment contract tests — 2 passed; Docker Compose configuration passed; full regression follows final validation.
- **Known issues**: No external cloud deployment was performed; managed Redis, storage, Keycloak, and provider credentials must be supplied by the deployer.
- **Next recommended action**: Begin Batch 32 with production readiness and CI/CD checks.

- **Date**: August 8, 2026
- **Batch**: Batch 8 (AI Job Matching)
- **What was implemented**:
  - Added candidate matching lookup for the selected company job.
  - Surfaced overall score, skill/experience/role factors, reasoning, and skill gaps inline.
  - Kept deterministic matching as the source of critical scores; no AI override was added.
- **Database changes**: None.
- **Tests**: Full API suite — 23 passed; frontend lint/build passed with one existing warning.
- **Known issues**: Match lookup is job-scoped and only displays candidates above the existing score threshold.
- **Next recommended action**: Continue the project creation and approval workflow.

- **Date**: August 8, 2026
- **Batch**: Batch 10 (Company Talent Discovery)
- **What was implemented**:
  - Added candidate filtering by keyword, role, minimum experience, and open-to-work state.
  - Added company job selection and invitation actions using profile IDs safely resolved to user IDs server-side.
  - Added regression coverage for the profile-ID invitation boundary.
- **Database changes**: None.
- **Tests**: Full API suite — 23 passed; frontend lint passed with one existing warning; previous production build remains green.
- **Known issues**: Explainable match factors are not yet presented inline in the company candidate cards.
- **Next recommended action**: Add match-factor presentation backed by the existing deterministic matching service.

- **Date**: August 8, 2026
- **Batch**: Batch 10 (Company Talent Discovery)
- **What was implemented**:
  - Added protected company application listing with candidate profile context and job association.
  - Added company review controls for valid status transitions.
  - Added candidate-review UI to the company talent page.
  - Added authorization and transition regression coverage.
- **Database changes**: None.
- **Tests**: Full API suite — 23 passed; frontend lint/build passed with one existing warning.
- **Known issues**: Candidate filtering, invitation UI, and explainable match detail remain.
- **Next recommended action**: Add candidate filters and wire the existing invite endpoint into the company workflow.

- **Date**: August 8, 2026
- **Batch**: Batch 9 (Job Applications)
- **What was implemented**:
  - Normalized new applications to `SUBMITTED` and invitations to `INVITED`.
  - Added server-side application transition validation and terminal-state protection.
  - Added worker withdrawal API/UI support.
  - Added application lifecycle regression coverage.
- **Database changes**: None; existing status column remains forward-compatible.
- **Tests**: Full API suite — 22 passed; frontend lint/build passed with one existing warning.
- **Known issues**: Company-side review UI is still the next part of this batch.
- **Next recommended action**: Add company application review controls and candidate context.

- **Date**: August 8, 2026
- **Batch**: Batch 4 (Jobs Marketplace & Search)
- **What was implemented**:
  - Added repeated `skills` and `max_salary` support to `GET /api/v1/jobs`.
  - Added salary range controls to the jobs UI and Axios array serialization so selected skills reach FastAPI.
  - Added SQLite-compatible keyword matching while retaining PostgreSQL full-text search in production.
  - Added regression coverage for skills, salary, and keyword filters together.
- **Tests**: `tests/test_jobs.py` — 4 passed in Docker; frontend lint/build passed with one existing warning.
- **Known issues**: Full backend suite has 7 pre-existing failures documented in `docs/CURRENT_SYSTEM_AUDIT.md`.
- **Next recommended action**: Fix auth role normalization and engineer profile timestamp serialization, then continue applications/talent discovery.

- **Date**: August 8, 2026
- **Batch**: Batch 3 (Professional Profile System)
- **What was implemented**:
  - Created `/engineers` public discovery page with live search, expandable filters (role, years exp, open-to-work), animated profile score ring SVG, skill badge cards, and skeleton loading states.
  - Created `/engineers/[id]` public profile page with gradient hero, experience timeline with dot markers, education section, projects grid, AI summary card, matching keywords, profile readiness ring, quick-facts sidebar, and external links.
  - Created `/companies` discovery page with search, industry/size/verified filters, logo cards, tech stack badges, and hiring status pills.
  - Created `/companies/[id]` public profile page with company hero, tech stack section, open positions list linked to `/jobs/[id]`, verification badge, and company info sidebar.
  - Added "Browse Engineers" (`/engineers`) and "Browse Companies" (`/companies`) links to `Sidebar.tsx` navigation.
  - Fixed unused imports (Globe2, Code2) and Lucide icon type error (title → aria-label).
- **Files changed**: `apps/web/src/app/engineers/page.tsx` (NEW), `apps/web/src/app/engineers/[id]/page.tsx` (NEW), `apps/web/src/app/companies/page.tsx` (NEW), `apps/web/src/app/companies/[id]/page.tsx` (NEW), `apps/web/src/components/Sidebar.tsx`.
- **Database changes**: None.
- **API changes**: None (all existing backend endpoints used: `/engineers/search`, `/engineers/{id}`, `/companies/public`, `/companies/{id}`).
- **Frontend changes**: 4 new pages, 1 updated component. Total routes: 25 (was 21).
- **Tests**: `npm run lint` — 0 errors. `npm run build` — 25 routes, 0 TypeScript/build errors.
- **Known issues**: None.
- **Next recommended action**: Execute **PROMPT 04 — JOBS MARKETPLACE & SEARCH**.
- **What was implemented**:
  - Implemented automatic `profile_score` completeness calculation (`_recalculate_score`) in `EngineerService`.
  - Added test suite `apps/api/tests/test_profiles.py` covering engineer onboarding, company onboarding, profile completeness calculation, and role authorization guards.
  - Verified frontend build with `npm run build` (`next build --webpack`) and `npm run lint`.
  - Updated all project memory documentation files (`docs/*`).
- **Files changed**: `apps/api/app/domains/engineers/service.py`, `apps/api/tests/test_profiles.py`, `docs/*`.
- **Database changes**: None (validated existing schema).
- **API changes**: Automatically updates `profile_score` on profile creation/update responses.
- **Frontend changes**: Build script verified (21 App Router routes compiled cleanly, 0 errors).
- **Tests**: Profile test suite created; frontend lint & build passed cleanly.
- **Known issues**: None.
- **Next recommended action**: Execute **PROMPT 03 — PROFESSIONAL PROFILE SYSTEM**.

## Last Validation Results
- Frontend Build: `npm run build` (`next build --webpack`) passed with 21 App Router routes compiled cleanly.
- Profile Completeness & Security: Tested and verified.
