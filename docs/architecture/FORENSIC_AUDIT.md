# Forensic Audit — Remote AI Platform (Phase 0)

**Date:** 2026-08-31
**Method:** Direct source inspection (backend, frontend, infra, CI/CD, security) by four parallel read-only research passes. No code was modified to produce this document. Live production state (Render/Supabase/GitHub) was cross-checked where noted.
**Supersedes:** the ~30 prior audit/report/certification documents in `docs/` (`FORENSIC_AUDIT.md`, `AUDIT.md`, `CURRENT_STATE.md`, `PRODUCTION_CERTIFICATION.md`, etc.) are stale — several describe a repository state (e.g. "API fails to boot, 0 features verified") that no longer matches reality. Per `CLAUDE.md`'s own warning, nothing in `docs/` describing "current" status should be trusted without re-verification; this document is the current source of truth as of the date above. The old files are left in place (not deleted) as historical record — see Technical Debt (H) for a recommendation to archive them.

---

## Executive Summary

The platform is a working, deployed, three-persona (engineer/company/admin) job marketplace with a real domain-driven FastAPI backend (21 domains, 20 wired routers), a Next.js 16/React 19 frontend, a provider-agnostic AI layer (LiteLLM), a real (if currently sandbox-default) Stripe payments integration, and a genuinely good authorization pattern (ownership checks are the norm, not the exception). Test coverage on the backend is real (180 passing tests) and CI validates lint/type/build/migrations on every push.

It is **not** yet a multi-tenant B2B platform (no `Organization` entity exists — "company" is one user with one profile), has **zero** frontend test coverage, and currently has **two High-severity authorization bugs** in production code (`POST /jobs` company-id spoofing, and an unauthenticated `/search` endpoint leaking private resume data). Production infrastructure is presently in a **known-bad state**: the Render API service's environment variables were wiped down to 4 non-secret values sometime during this session, meaning any fresh deploy fails immediately (confirmed twice) and the currently-live instance is running only because it hasn't been restarted since the wipe — this is the single most urgent item in this report and blocks safely completing Phase 1 until resolved by the operator.

---

## A. Current Architecture

```
                         Internet
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
        Vercel (Next.js 16 /          Render free tier
        React 19 frontend)            (single FastAPI web
                            │           dyno, WEB_CONCURRENCY=1)
                            │                │
                            │     ┌──────────┼──────────────┐
                            │     ▼          ▼              ▼
                            │  Supabase   Supabase      GitHub Actions
                            │  Postgres   Storage        cron (6h)
                            │  (Session-   (S3-compat,   → POST /jobs/sync
                            │   mode        via boto3)      (Celery-beat
                            │   pooler)                     substitute)
                            │
                            └── axios client, Bearer JWT in localStorage,
                                401-refresh-retry interceptor
```

- **No Celery worker or beat process runs in production.** The only production job-scheduling substitute is a GitHub Actions cron hitting `POST /jobs/sync` synchronously — Celery/Redis exist only in local Docker Compose dev.
- **No CDN/edge layer** (no Cloudflare) sits in front of either Vercel or Render today, despite `render.yaml`/docs describing one as a future target.
- **Identity**: self-issued HS256 JWTs (access 15 min / refresh 7 days) plus, as of this session, direct (non-brokered) Google/Microsoft OAuth2. Keycloak exists only in local dev Docker Compose — it was evaluated for production and rejected (JVM cannot boot in Render's 512MB free tier; confirmed via three separate boot-flag experiments) and is not wired to the API in production at all despite `FEATURE_KEYCLOAK_AUTH: bool = True` defaulting on.
- **AI**: real LiteLLM-based provider abstraction with automatic primary→fallback failover across three concrete agents (resume parsing, job enrichment, and quality evaluation — the last of these is real and shipped but under-documented in `CLAUDE.md`).
- **Payments**: `PaymentProvider` Protocol with two implementations — `SandboxPaymentProvider` (default, fully deterministic, no network calls) and `StripePaymentProvider` (manual-capture PaymentIntents as the escrow primitive, real webhook signature verification, real idempotency). Payout (Stripe Connect) is an honest `NotImplementedError`, not faked.

---

## B. Existing Features (inventory)

| Area | Status |
|---|---|
| Auth: email/password, refresh, logout-all, password reset, email verification | Implemented |
| Auth: Google/Microsoft OAuth2 (direct, non-brokered) | Implemented this session; not yet end-to-end tested with real user consent (needs client secrets — see Pending) |
| Engineer profiles (resume upload/parse, skills, experience, education, public directory) | Implemented |
| Company profiles (single-user-owned, no multi-seat orgs) | Implemented, structurally limited (see D. Data Model) |
| Jobs (CRUD, 5 external aggregators, AI enrichment) | Implemented |
| Applications (full status workflow) | Implemented |
| Matching (AI-scored engineer↔job, candidate discovery) | Implemented |
| Search (cross-entity) | Implemented, but see Security §2 — currently leaks private data |
| Projects/milestones/tasks/work-ledger/offers | Implemented (spans two domains — see Data Model) |
| Contracts | Implemented |
| Payments (escrow hold/release/refund, sandbox + Stripe) | Implemented; payouts not implemented (honest stub) |
| Messaging (1:1 conversations, WebSocket) | Implemented, correctly authenticated |
| Notifications (REST + WebSocket) | Implemented, WebSocket auth bug from a prior session confirmed fixed and still fixed |
| Groups (membership, roles, posts) | Implemented |
| Social feed (posts, comments, likes, visibility) | Implemented, but see Security §2.14 — visibility not enforced on direct-ID access |
| Trust/reputation (reviews, verification) | Implemented |
| Quality (AI submission evaluation, code review) | Implemented, undocumented in CLAUDE.md |
| Admin (user/job management, role changes, health diagnostics, moderation, audit log) | Implemented, role-gating confirmed uniform |
| Job source ingestion (RemoteOK, Arbeitnow, Remotive, USAJobs, TheMuse) | Implemented |
| Trending-skills refresh, stale-match recompute (scheduled) | **Stubbed** — both Celery tasks are literal no-ops despite running on a beat schedule (would also never run in prod today regardless, since no beat process is deployed) |
| `marketplace` domain | Models are live and load-bearing (imported by 3 other domains) but has no router of its own — not a broken feature, but an organizational inconsistency |

---

## C. Broken Features

| Feature | Current behavior | Expected behavior | Root cause | Severity | Recommended fix |
|---|---|---|---|---|---|
| `POST /jobs` company attribution | A COMPANY-role user who supplies any `company_id` in the request body gets it used verbatim, no ownership check | Job should always be attributed to the caller's own company | Ownership check only runs `if not data.company_id` (i.e. only on the auto-fill path) | **High (security)** | Always validate — or always derive server-side — `company_id` for COMPANY-role callers, matching the pattern already correct in `applications`/`projects`/`payments` routers |
| `GET /search` | Unauthenticated; serializes engineers with the *private* schema, exposing `resume_url` and `parsed_resume_data` for every public engineer | Should require auth (or use the public schema) like every other engineer-exposing endpoint | Wrong response model selected; the correct public schema and pattern already exist elsewhere in the codebase | **High (security)** | Switch to `EngineerPublicProfileResponse` or gate behind auth + strip fields, mirroring `engineers/router.py::get_engineer_by_id` |
| Celery `sync_source(source)` | Ignores its `source` argument entirely; syncing "one source" actually re-syncs every source | Should sync only the named source | No per-source variant of the underlying async helper was ever written | **Medium (correctness, not currently reachable in prod — no worker deployed)** | Either implement per-source sync or remove the misleading per-source task/API surface until it's needed |
| `refresh_trending_skills` / `compute_stale_matches` Celery tasks | Literal no-op stubs (`return {"status": "ok"}`) | Should actually recompute trending skills / stale matches | Never implemented past the scheduling scaffold | **Medium (missing capability, not currently reachable in prod)** | Implement, or remove from `beat_schedule` and document as not-yet-built rather than silently scheduled-but-inert |
| `is_deleted`/`deleted_at` soft-delete columns (Jobs/Projects/Contracts) | Columns + indexes exist (migration 026); zero code reads or writes them | Soft-delete should actually gate queries and be settable | Half-finished feature — schema shipped, application logic never followed | **Low (dead schema, not a live bug)** | Either wire up soft-delete throughout or drop the unused columns/indexes |
| Production env vars | Render service `srv-d9uea4nlk1mc73elkm10` currently has only 4 non-secret env vars set (`MICROSOFT_OAUTH_TENANT`, `MICROSOFT_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_ID`, `FRONTEND_URL`); `DATABASE_URL`, `JWT_SECRET_KEY`, Redis/MinIO creds, `APP_ENV`, `CORS_ORIGINS`, `GROQ_API_KEY` are all missing | Full production env var set restored | Almost certainly a Render env-vars `PUT` (full-replace, not merge) issued earlier this session when setting the 4 OAuth vars | **Critical (live production risk)** | Operator must restore the full env var set from their own records in the Render dashboard — see Pending Manual Actions |

---

## D. Infrastructure Problems

- **Render's own health-check gate cannot detect most outages.** `render.yaml`'s `healthCheckPath: /health/live` is pure liveness (always returns healthy, zero dependency checks) — a fully-down DB, Redis, storage, or AI provider would never pull the service from traffic via this path. Docker Compose's own `api` healthcheck has the same blind spot via a legacy `/health` alias that always 200s on `DEGRADED`.
- **Celery/Redis is fully non-functional in production, not partially.** No worker or beat process is deployed; job-sync is replaced by a GitHub Actions cron calling the sync endpoint synchronously (not via Celery at all), and the other two scheduled jobs (trending skills, stale matches) have no production substitute and simply never run.
- **`DATABASE_URL` has zero production validation.** `validate_production_settings()` checks `JWT_SECRET_KEY`, `KEYCLOAK_CLIENT_SECRET`, `MINIO_SECRET_KEY`, `CORS_ORIGINS`, `SEED_DEMO_DATA` — never `DATABASE_URL`. A missing/bad value falls through to a hardcoded localhost dev default with no named, actionable startup error (confirmed live: this is exactly what's currently happening — see Broken Features).
- **The entire production-config fail-fast mechanism is disarmed by one missing env var.** `is_production` is defined purely as `APP_ENV == "production"`; if `APP_ENV` is unset, `validate_production_settings()` returns immediately as a no-op — silently allowing the dev-default JWT secret, Keycloak secret, and MinIO credentials into a real production deployment with zero warning. This is the actual, currently-live failure mode in this session's env-var incident (`APP_ENV` is one of the missing vars).
- **Startup migration failure handling is inconsistent.** `start-production.sh`'s `alembic upgrade head` crashes the process on failure (via `set -eu`), but the *second*, redundant migration attempt inside FastAPI's own `lifespan()` only logs a warning on failure while a DB-connectivity check three lines away in the same function does `raise` — two near-identical checks with different fail-fast behavior.
- **CI never deploys anything.** `.github/workflows/ci.yml` is lint/type/build/migration-validation only; actual deployment relies entirely on Render/Vercel's own git-push auto-deploy, unmediated by any repo-level gate.
- **`tests/e2e/` is wired into CI but empty** — the `e2e` job in `ci.yml` runs Playwright against an empty test directory, so it currently validates nothing beyond "the stack boots."
- Fragile Keycloak health check in Docker Compose (hand-rolled `/dev/tcp` string-match on `"200 OK"`), and a Celery-beat health check that only confirms the *process* exists, not that it can reach the broker.

---

## E. Security Problems

Full IDOR sweep covered all 21 domain routers. The pattern found was, encouragingly, **mostly correct** — server-side ownership checks are the norm across applications, projects, contracts, network, notifications, saved_jobs, admin, matching, groups, and trust. Two real gaps and several lower-severity items were found:

| # | Finding | Severity |
|---|---|---|
| 1 | `POST /jobs` — client-supplied `company_id` not validated when present (job-posting impersonation) | **High** |
| 2 | `GET /search` — unauthenticated, leaks private resume data via wrong response schema | **High** |
| 3 | OAuth CSRF-state/handoff codes are in-memory, correct only under `WEB_CONCURRENCY=1`; no guard against future config drift | **Medium (contingent)** |
| 4 | Rate limiter trusts client-supplied `X-Forwarded-For`/`CF-Connecting-IP` with no trusted-proxy allowlist — trivially bypasses login/register brute-force throttling | **Medium** |
| 5 | Social post visibility (`PRIVATE`/`CONNECTIONS`) not enforced on direct `post_id` read/like/comment | **Medium** |
| 6 | Resumes served via permanent non-expiring direct storage URLs; `generate_presigned_url()` exists but is unused dead code | **Medium** |
| 7 | Payments release/refund over-restrict ADMIN (payer-id check blocks admin override) — inconsistent, not exploitable | **Low** |
| 8–15 | Minor: permissive resume MIME allowlist (mitigated by magic-byte check), full-body-read before size check, `python-jose` maintenance risk (mitigated by hardcoded algorithm list), unused `passlib[bcrypt]` extra, dead rate-limit tier constants, API docs always enabled, no CSP/security headers (real residual risk given `localStorage` token storage — XSS, not CSRF, is the actual threat model here) | **Low/Informational** |

**Confirmed-intact positive controls** (explicitly re-verified, not assumed): notifications WebSocket auth (token param + verify + user-id match), admin role-gating (uniform across every admin endpoint, no gaps), CORS wildcard+credentials combination (blocked by `validate_production_settings()`), Stripe webhook signature verification.

**Live incident, not a code finding:** production env vars wiped (see Broken Features) — while the *code's* fail-fast intent is sound, it was defeated by the missing `APP_ENV` value, which is itself worth hardening against (e.g. treat "no `APP_ENV` set at all" as an ambiguous, warn-loudly state rather than silently defaulting to development semantics on a real deployment).

---

## F. Data Model Problems

- **No `Organization`/`Tenant` entity exists anywhere.** "Company" is a `UserRole` enum value plus a 1:1 `CompanyProfile` per user (`user_id` is `unique=True`). One human = one company account; no shared administration, no per-org roles, no seat management. **This is the single largest structural gap relative to the stated goal of generalizing into a real B2B multi-seat platform** — every later phase involving organizations depends on introducing this entity.
- **Payments is split across two domains**: `PaymentTransaction` is defined in `projects/models.py`, not in `payments/`, which only holds schemas/router. Functionally fine today, but a real obstacle to ever extracting payments as an independent module.
- **Project/task management is split across two domains**: `Project`/`ProjectMember`/`Milestone` live in `projects/models.py`; `ProjectTask`/`TaskComment`/`TaskDependency`/`WorkSubmission`/`WorkLedgerEntry`/`ProjectReview` live in `marketplace/models.py`, cross-imported back into `projects/router.py`. Looks like an artifact of incremental migration history rather than intent.
- **Duplicated activity-log concepts**: `ActivityLog` and `AuditEvent` (both in `admin/models.py`) plus `ProjectActivity` (marketplace) cover overlapping ground with different schemas — `AuditEvent` looks like the intended superset that should replace `ActivityLog`.
- **Likely-dead model**: `marketplace.Recommendation` (generic user/job/engineer + single float score) appears to have zero repository/service usage, superseded by `matching.JobMatch`'s richer multi-factor model.
- **Missing DB-level uniqueness**: `JobApplication` has no `UniqueConstraint(user_id, job_id)` — duplicate-application prevention is service-layer/race-prone, unlike the equivalent constraints on `saved_jobs`/`matching`.
- **Circular optional FK pairs** (`Contract.project_id` ↔ `Project.contract_id`, `Milestone.contract_milestone_id` ↔ `ContractMilestone`) are correctly implemented with `use_alter=True` but are an awkward two-way link where one direction should probably be authoritative and the other resolved by query.
- **Inconsistent status-string casing** across ~10 non-enum status columns (`Contract.status` upper-snake, `JobMatch.status` lower-case, `Post.visibility` upper, `GroupMembership.role` lower) — none besides `User.role` are real DB enums, so invalid values are only caught (inconsistently) at the service layer.
- **Positive**: migration history (29 files) is clean — no destructive `upgrade()` calls found anywhere, only in `downgrade()` paths; indexing and constraint discipline is otherwise good (real `UniqueConstraint`/`CheckConstraint` usage, a deliberate later indexing pass in migrations 018 and 026).

---

## G. Frontend Problems

- **Zero automated test coverage.** No jest/vitest/playwright, no test files anywhere in `apps/web`, despite root `turbo.json` declaring a `test` pipeline that silently does nothing for this workspace. This is the single largest frontend gap.
- **38 files hardcode the brand color hex** (`#B54A2C`) via Tailwind arbitrary-value classes instead of `var(--color-brand)`, including the persistent global chrome (`TopNavbar.tsx`, `Sidebar.tsx`). Since the design system deliberately uses a *different* brand shade in dark mode, every one of these will not adapt — a real, systemic dark-mode visual bug across nearly the entire product, not a cosmetic nitpick.
- **`app/jobs/new/page.tsx` has no error handling on submit at all** — a failed job-post request (validation error, network failure) leaves the user with a dead-end spinner and no feedback, on a core company-persona flow.
- Two profile-edit drawers show a hardcoded generic error string instead of the backend's actual (already-available) structured error detail — a real UX regression versus what the codebase's own `extractErrorMessage()` helper already enables elsewhere.
- No orphaned/dead routes found; navigation is consistently wired via `Sidebar`/`TopNavbar`/`MobileBottomNav`, with `jobs/new` and `/settings` being the only routes without a single canonical nav entry point (minor discoverability gap, not a defect).
- Accessibility: form primitives (`Input`/`Textarea`/`Select`) correctly associate labels and `aria-invalid`; modals/command palette have `role="dialog"`/`aria-modal` but no focus trap or focus restoration on close.
- Responsive design: the app shell (top nav / mobile bottom nav) has one deliberate, consistent breakpoint contract; individual page content layouts are ad hoc per page with no shared convention.
- No genuine API-mismatch or broken-route issues found; the axios client, 401-refresh-interceptor, and `extractErrorMessage()` structured-error handling are correctly implemented and (with the two exceptions above) consistently applied.

---

## H. Technical Debt (ranked)

1. **No multi-tenant `Organization` model** — blocks any real B2B/company-seat functionality; the biggest single piece of debt relative to the stated product direction.
2. **Two High-severity authorization bugs live in production code** (`POST /jobs` spoofing, unauthenticated `/search` leak) — must be fixed before any further feature work in those areas.
3. **Zero frontend test coverage** on an auth-gated, persona-differentiated, forms-heavy application.
4. **~30 stale, overlapping "final report"/"audit"/"certification" markdown documents in `docs/`** from prior sessions, several actively contradicting current reality (e.g. claiming 0 verified features when 180 backend tests currently pass and the app is live in production) — a real onboarding hazard for any future contributor (human or AI) who trusts them at face value, exactly as `CLAUDE.md` already warns.
5. **Payments/Projects domain-boundary fragmentation** (`PaymentTransaction` in `projects/models.py`, task-management split between `projects` and `marketplace`) — will cost more to unwind the longer it's left.
6. **Celery/Redis is architecturally present but operationally inert in production** — two of three scheduled jobs never run at all, and this isn't surfaced anywhere a human would notice without reading source.
7. **Dead code accumulating**: unused `is_deleted` soft-delete columns/indexes, unused `Recommendation` model, unused `generate_presigned_url()`, dead rate-limit tier constants, `sync_source()`'s ignored argument.
8. **Design-system enforcement gap**: nothing lints against hardcoded brand-color literals bypassing the token system (38 files currently do).
9. **Inconsistent status-string conventions** across ~10 columns with no DB-level enum enforcement.

---

## I. Recommended Target Architecture

See `docs/architecture/TARGET_ARCHITECTURE.md`, `docs/infrastructure/FREE_TIER_ARCHITECTURE.md`, and `docs/architecture/AWS_MIGRATION.md` for the full target-state design, free-tier constraints, and future cloud migration mapping. In summary: introduce `Organization`/`OrganizationMember` as first-class entities without discarding the existing `User`/`CompanyProfile` data (migrate `CompanyProfile` to be organization-owned rather than user-owned); consolidate the `projects`/`marketplace` split into one `projects` domain; move `PaymentTransaction` into a real `payments` domain; introduce permission-based authorization alongside the existing (and largely correct) ownership-check pattern rather than replacing it; keep the current $0 infrastructure topology but hard-fail startup on `APP_ENV` being unset in any environment that isn't explicitly `development`/`test`, and add real dependency checks to whatever endpoint actually gates traffic.

---

## What Exists / What Works / What Is Broken / What Must Be Preserved / What Must Be Replaced / What Must Be Introduced

- **Exists and works**: full three-persona marketplace product surface, real AI layer with failover, real Stripe-capable payments architecture, mostly-correct authorization pattern, clean migration history, working CI (lint/type/test/build/migration-validate), a genuinely deployed frontend and backend.
- **Broken right now**: production env vars (operator action required), two High-severity IDOR-class bugs, two stubbed Celery tasks, one ignored-argument Celery task bug.
- **Must be preserved**: the existing ownership-check authorization pattern (it's good — extend it, don't replace it), the provider-abstraction style already used for AI and payments (replicate it for identity/storage per the target architecture), the existing three-persona feature set (nothing here should be deleted to "simplify" toward generic terminology — see Product Vision phases).
- **Must be replaced/consolidated**: the `projects`/`marketplace` domain split, the `payments`/`projects` model-ownership split, the two overlapping activity-log tables.
- **Must be introduced**: `Organization` entity and org-scoped authorization, real dependency-aware health checks gating actual traffic, `APP_ENV` fail-safe validation, frontend test coverage, a design-system lint rule against hardcoded brand colors.
</content>
