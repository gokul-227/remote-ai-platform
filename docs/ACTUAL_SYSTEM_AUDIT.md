# Actual System Audit

**Method**: execution-verified, not documentation-derived. Produced 2026-08-11 by booting the
real local stack (Docker Compose), hitting live endpoints, and reading the actual source of every
domain/screen named below. Superscript refs are file:line evidence gathered during this pass.

## Why this doc exists

`docs/` already contained ~30 prior status/audit files (`FORENSIC_AUDIT.md`, `FINAL_ENGINEERING_REPORT.md`,
`AGENT_STATE.md`, `CURRENT_STATE.md`, `VERIFICATION_MATRIX.md`, etc.), written across at least three
separate "we are done" cycles between 2026-08-08 and 2026-08-09. Each "100% complete" claim was
contradicted by a forensic pass within hours — most notably `AGENT_STATE.md` claiming "ALL 21 PHASES
COMPLETE, Known Bugs: None identified" three hours before `FORENSIC_AUDIT.md` found a P0 `ImportError`
crash-looping the API container and the live DB 13 migrations behind head. The most recent doc cycle
(2026-08-09) is already 4 commits stale with no update trail. **Do not trust any status claim in the
other docs files without re-verifying it against running code.** This file supersedes them for
current-state questions; it will itself go stale the moment the code changes again, so re-verify before
relying on it in a future session.

## Feature status

| Feature | Status | Evidence |
|---|---|---|
| Docker Compose stack boot | **WORKING** | All 8 core containers (postgres, redis, minio, keycloak, api, web, celery-worker, celery-beat) healthy; verified live 2026-08-11. |
| DB migrations | **WORKING** | `alembic heads` inside the api container → `022_groups (head)`, 43 tables present via `\dt`. Bare-metal Python 3.11 venv path is unverifiable on a machine without `python3.11` installed — this is an environment gap, not a code gap. |
| Health/OpenAPI endpoints | **WORKING** | `GET /api/v1/health` → 200 with real DB/queue status. Note: `GET /health` (no `/api/v1` prefix) is 404 — the route is namespaced under the versioned prefix, unlike what a bare `/health` reference might suggest. |
| Registration / login / JWT issuance | **WORKING** | Live `POST /api/v1/auth/register` → `POST /api/v1/auth/login` round-trip returns real access/refresh tokens and provisions a Keycloak identity synchronously. |
| Keycloak OIDC signature verification | **BROKEN (docstring lies)** | `AuthService.verify_token` claims Keycloak OIDC integration but only does `jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])` against the app's own local shared secret — no JWKS fetch, no RS256 verification anywhere in the codebase. It cannot actually validate a token signed by a real Keycloak server; it only validates the app's own self-issued tokens. Functionally fine for this app's own auth flow (which is self-issued, not federated), but the docstring overclaims and should be fixed or the design intent clarified. |
| Role-based authorization (engineer/company/admin) | **WORKING**, one dead import | `require_role()` is genuinely wired via `Depends()` across 40+ endpoints (matching, admin, projects, applications, jobs, companies). `trust/router.py` imports `require_role` but never calls it — its GET endpoints are intentionally public (trust scores/reviews are public data) but the unused import should be removed or the intent documented. |
| Rate limiting | **PARTIALLY_WORKING** | Real in-process sliding-window limiter, not a stub (contradicts stale `docs/CURRENT_STATE.md`). Only guards 3 hardcoded paths (`/auth/login`, `/auth/register`, `/engineers/me/resume`) — everything else is unlimited. In-process (per-worker) state means it won't coordinate across multiple API replicas; fine for single-instance free-tier deploy, a real gap at scale. |
| Job aggregators (RemoteOK, Arbeitnow, Remotive, USAJobs, TheMuse) | **WORKING** | All 5 make real HTTP calls, guard non-200/timeout/malformed responses, and each failure is isolated per-source in `sync_all_job_sources` — one broken source doesn't abort the sync loop. `USAJobs` short-circuits cleanly if its API key isn't configured. |
| Job dedup | **WORKING** | `JobRepository.upsert_external_job` keys on `external_id`; update-in-place vs create-new is correct. |
| Job search/filter | **WORKING** | Live `GET /api/v1/jobs` returns real stored jobs (20 present after seed) with source/is_active fields; backend-driven, not frontend-only filtering. |
| Matching engine — determinism | **WORKING** | Confirmed rules-based arithmetic, zero LLM calls in the scoring path. Weighted sum (skill 40% / experience 25% / role 15% / timezone 8% / availability 7% / compensation 3% / remote 2%) sums to 1.00. |
| Matching engine — timezone/remote sub-scores | **PARTIALLY_WORKING (bug)** | `timezone_score` and `remote_score` don't actually compare the relevant values — `timezone_score` only checks whether both `job.remote_preference` and `engineer.timezone` are truthy (never compares actual timezones); `remote_score` checks truthiness of a lowercased string rather than any real preference match. Low blast radius (8% + 2% of the weighted total) but the field names promise more than the code delivers — should be fixed before calling matching "explainable." |
| Matching engine — score bounds | **WORKING (implicit, not enforced)** | No explicit `max(0, min(100, ...))` clamp on `overall_score`, but every sub-score is individually bounded 40–100 by construction so it can't currently escape [40,100] given current weights. Fragile if a sub-score formula changes later without re-deriving the bound — worth adding an explicit clamp defensively. |
| AI provider abstraction (LiteLLM only) | **WORKING** | Zero direct `openai`/`anthropic`/`google.generativeai` imports anywhere in `apps/api`. Confirmed via full-tree grep. |
| AI graceful degradation | **PARTIALLY_WORKING** | `LLMClient.complete()` never raises — on total provider failure it returns `"{}"`, and callers (`ResumeParserAgent`, `JobEnricherAgent`) fall back to generic defaults (`"Software Engineer"` headline, `"mid"` experience level, empty skill lists) rather than crashing. This is graceful in that the app stays up, but it's a **silent** degrade — a user gets a technically-200 response with near-empty AI output and no visible signal that AI was unavailable. No deterministic keyword-extraction fallback exists (the mega-prompt's "PDF extraction → deterministic skill dictionary → optional LLM" design is not what's implemented; it's "LLM or nothing useful"). |
| Networking/chat (connections + WebSocket messaging) | **WORKING** | Real `Connection`/`Conversation`/`Message` models, real WebSocket endpoint (`/messages/ws/{conversation_id}`) with token-auth, and real Redis pub/sub cross-worker fan-out with an in-memory local fallback if Redis is down. Frontend genuinely opens this socket and falls back to REST POST if the socket isn't open. This is a substantially complete chat system, not a stub — contrary to what a "networking may be unfinished" framing might assume. |
| Social feed | **WORKING** (per source read; not live-exercised) | Real models/router/schemas, documented as deterministic "connections + self posts, recency-sorted." Not hit live in this pass. |
| Project workspace (milestones/tasks/escrow/ledger/AI reports) | **WORKING** (per source + frontend cross-check; deep logic not fully verified) | Both backend (`projects/router.py`, 768 lines, role-gated per endpoint) and frontend (`useProject.ts`, full milestones/tasks/submissions/ledger/payments/reviews UI) are real and wired together. Not exercised live end-to-end (no project was created/progressed in this pass) — flag as verified-by-code-reading, not verified-by-execution. |
| `marketplace` domain | **DOCUMENTED_ONLY / dead code** | Has only `models.py`; its router is never registered in `main.py`, and no frontend hook references it. Not broken — simply unused. Either wire it up or remove it; leaving it is harmless but confusing. |
| Frontend auth (register/login/refresh) | **WORKING** | Real POSTs, real 401→refresh→retry-once interceptor, tokens in `localStorage`. |
| Frontend engineer flow (profile, resume upload, recommendations, applications) | **WORKING**, one cosmetic gap | Recommendations page shows real 6-factor score breakdown + AI reasoning + skill gaps. Engineer dashboard's job-list "match" pill is a static em dash placeholder (the dashboard's job list isn't the scored feed) — cosmetic, not fake data; real scores are one click away. |
| Frontend company flow (profile, job posting, candidate discovery) | **PARTIALLY_WORKING** | Candidate-matching view (`company/candidates`) is fully real with genuine scores/reasoning. Company **dashboard** has 3 real gaps: a hardcoded "Skill Matches" stat card, a `match_score` field displayed per-candidate that the backend never populates (no such field exists on the engineers list endpoint), and a dead "save candidate" star button with no `onClick` handler. |
| Frontend admin dashboard | **WORKING** | All stat/log/health panels backed by real parallel API calls; the only static array is an explicit fallback used when the live health-detail call fails, not a fake primary path. |
| CI/CD | **WORKING (added this pass)** | `.github/workflows/ci.yml` added — backend test/migrations + frontend lint/typecheck/build, every step pre-verified locally before being committed. Was empty prior to this session; `docs/CURRENT_STATE.md`'s prior claim that CI was "✅ DONE" was false at the time it was written. |
| Deployment configs (Render/Vercel/Fly/Netlify) | **NOT_IMPLEMENTED** | Zero deploy-config files anywhere (`render.yaml`, `vercel.json`, `fly.toml`, `netlify.toml`, `app.yaml` — none exist). Dockerfiles for both `apps/api` and `apps/web` are solid and container-deploy-ready, but nothing platform-specific has been written yet. |
| Automated tests (backend) | **WORKING — 93/93 passing** | Couldn't run via a bare venv (no Python 3.11 interpreter on this machine; committed venvs are version-mismatched). Ran via `docker compose -f infra/docker/docker-compose.yml run --rm test`, which uses the Dockerfile's pinned Python 3.11 `test` target — 93/93 passed, confirmed twice (once pre-fix, once post-fix to confirm the matching-engine change didn't break `test_matching.py`). This is the one prior-docs claim that held up under re-verification. |
| Automated tests (frontend) | **NOT_IMPLEMENTED** | No jest/vitest/playwright installed, no test script in `apps/web/package.json`, `tests/e2e/` at repo root is empty. |
| Committed secrets | **CONFIRMED CLEAN** | No `.env` ever committed to git history; no live-looking API key/secret patterns in tracked files. |

## Phase 2 fixes applied and verified (2026-08-11)

All of the following were fixed and re-verified by actually running the affected code, not just edited
and assumed correct:

1. **Matching engine timezone/remote sub-scores** (`apps/api/app/domains/matching/service.py`) — replaced
   the truthiness-only checks with real content comparisons: `timezone_score` now compares the job's
   free-text timezone/region constraint against the engineer's free-text timezone; `remote_score` now
   compares job `is_remote` against the engineer's actual `remote_preference` value (remote/hybrid/onsite)
   instead of just checking the string is non-empty. Backend test suite re-run after the change: still
   93/93 passing.
2. **`AuthService.verify_token` / `get_current_user` docstrings** — corrected to state plainly that these
   validate self-issued HS256 tokens (signed with the app's own `JWT_SECRET_KEY`), not Keycloak-signed
   RS256/JWKS tokens, and that there is no DEBUG-mode mock-user fallback. Behavior unchanged — this was a
   documentation-accuracy fix, not a functional change. (Implementing real Keycloak signature verification,
   if actually desired, is separate follow-up work — not done here.)
3. **Company dashboard** (`apps/web/src/app/company/dashboard/page.tsx`) — removed the fake `match_score`
   pill and dead "save" star button per candidate (there is no backend "save engineer" feature anywhere in
   the codebase — this isn't a wiring gap, it's a genuinely missing feature; pretending it works via a dead
   button was worse than removing it). Replaced the hardcoded "Skill Matches" stat with a real
   "Applications Received" count from the already-existing `useCompanyApplications` hook. Candidate rows now
   link to the real `/engineers/{id}` public profile route. Verified: `tsc --noEmit`, `eslint`, and
   `next build` all pass clean on the changed file.
4. **`trust/router.py`** — removed the unused `require_role` import.
5. **CI added** (`.github/workflows/ci.yml`) — three jobs: backend (ruff + mypy, both non-blocking pending
   the pre-existing lint debt below; pytest via the Docker `test` service, blocking), frontend (lint,
   `tsc --noEmit`, `next build`, all blocking), and migrations (alembic `upgrade head` against a fresh
   Postgres service container, blocking). **Every step in this workflow was manually executed against the
   current tree before being added** — this isn't aspirational CI, it's CI encoding checks that were just
   confirmed to pass: 93/93 backend tests, clean frontend lint/typecheck/build, and clean migrations from
   an empty database.

## Security audit results (2026-08-11) — Phase 9

Full audit of CORS, IDOR, file upload, SSRF, SQLi, XSS, WebSocket auth, debug-mode leakage, password
handling, and admin endpoint gating, verified by reading code and hitting the live stack. Findings from
the earlier auth/rate-limit pass (Keycloak RS256, rate-limit path coverage, no committed secrets) are not
repeated here.

**Fixed, and the exact cross-tenant reproduction re-run to confirm the fix:**

1. **CRITICAL — broken access control on `POST /payments/escrow`** (`apps/api/app/domains/payments/router.py`).
   The endpoint checked that `project_id` and `payee_id` existed but never checked the caller's company
   actually owned the project — any authenticated company could create escrow transactions against *any*
   project in the system. Reproduced live: Company B created a `201` escrow transaction against Company
   A's project before the fix. Fixed by adding the same ownership check `projects/router.py` already uses
   elsewhere. Re-verified live after the fix: the identical request now returns `403 {"detail":"Project
   access required"}`; the legitimate same-owner case still returns `201`.
2. **HIGH — same missing-ownership-check pattern on `POST /contracts`** (`apps/api/app/domains/contracts/router.py`).
   `project_id` was accepted and attached to a new contract without validating it belonged to the caller's
   company — not even a `db.get()` existence check. Reproduced live pre-fix (`201` for a cross-tenant
   contract), fixed with the same ownership check, re-verified live post-fix (`403`).
3. **LOW — registration password minimum was 6 characters** (`apps/api/app/domains/auth/schemas.py`),
   inconsistent with the frontend's own zod validation which already required 8. Raised backend minimum to
   8 to match.
4. **LOW — no production-boot guard against a CORS wildcard** (`apps/api/app/core/config.py`). Current
   `CORS_ORIGINS` default is a safe explicit allowlist, not a wildcard — this was not exploitable today,
   but unlike `JWT_SECRET_KEY`/`KEYCLOAK_CLIENT_SECRET`/`MINIO_SECRET_KEY`, there was no check rejecting a
   future `CORS_ORIGINS=*` misconfiguration at boot in production (which, combined with the existing
   `allow_credentials=True`, would be a real credentialed-wildcard CORS hole). Added the same fail-fast
   check pattern.

All four fixes re-verified against the full 93-test backend suite (still 93/93 passing) after rebuilding
the Docker images — not just diffed and assumed correct.

**Confirmed clean, no action needed**: WebSocket auth on `/messages/ws/{conversation_id}` genuinely checks
conversation membership, not just login status. IDOR checks on `applications`, `network`, `saved_jobs`,
and `groups` routers are consistently correct — `projects/router.py`'s ownership-check pattern is in fact
the *correct* reference implementation; findings #1 and #2 above were sibling endpoints in other domains
that didn't reuse it. File upload validates by magic bytes (not just extension), enforces a server-side
size cap, and randomizes stored object names — real protections, not test-mocked theater. No SSRF surface
(no endpoint fetches a user-supplied URL). No raw SQL string interpolation anywhere. No
`dangerouslySetInnerHTML`/`innerHTML` in the frontend. The generic exception handler never leaks stack
traces regardless of `DEBUG`. All `/admin/*` and `/moderation/*` endpoints live-verified to return 403 for
a non-admin token.

## E2E test suite (Playwright) — Phase 10

Added `tests/e2e/` (a new npm workspace, using the `playwright`/`@playwright/test` dependency that was
already present in the root `package.json` but never wired up). Five real journeys, all run against the
live Docker Compose stack (not mocked): engineer register→browse→search→open job→save→apply; engineer
recommendations render real backend-driven data; company register→create profile→post a job→reach
candidate discovery; admin login→dashboard with real stats; and an authorization-boundary check
(non-admin token hitting `/admin/stats` gets 403). All 5 pass. Wired into `.github/workflows/ci.yml` as a
new `e2e` job that boots the real stack, seeds demo data, and runs the suite — this is the CI job most
likely to catch a regression that unit tests miss, since it exercises actual HTTP round-trips through the
real frontend.

## Known debt intentionally left unfixed (out of scope for this pass)

1. **962 pre-existing `ruff check` violations** in `apps/api`. Far too large to fix blindly in one pass
   without risking unrelated behavior changes; many are auto-fixable but require review, not a blanket
   `--fix`. Left as a non-blocking CI signal (`continue-on-error: true`) rather than silently ignored or
   falsely claimed clean. Pay down incrementally.
2. **AI failure is silent.** No visible signal to the user/admin when resume parsing or job enrichment
   fell back to generic defaults because the AI provider was unavailable. The admin dashboard's
   `/admin/ai-usage` call is a partial start; individual profile/job records aren't flagged as
   AI-enriched-vs-defaulted. Not fixed in this pass — a real feature, not a one-line fix.
3. **"Save engineer" is a genuinely missing feature**, not a stub — no backend model/endpoint exists for
   companies to bookmark candidates (unlike the mirrored, working `saved_jobs` feature on the engineer
   side). The mega-prompt's product spec calls for this; building it (model + migration + repository +
   endpoints + frontend) is a real feature addition, not a bug fix, and wasn't done in this pass.
4. **Real Keycloak RS256/JWKS token verification is not implemented** — see fix #2 above; the docstring
   now accurately reflects this rather than overclaiming it.

## What does NOT need fixing (contrary to what stale docs might suggest)

- The frontend is not a facade — 23/23 hooks are wired to real, live backend endpoints.
- Chat/networking and the project workspace are substantially complete systems, not stubs.
- Job aggregation, dedup, and per-source failure isolation all work correctly.
- No committed secrets, no direct paid-AI-SDK imports, dependencies are current and not EOL.

## Environment notes for future sessions

- This machine has no `python3.11`; use the Docker `api` container for anything requiring the exact
  pinned Python version (migrations, pytest).
- The local Docker Compose stack was left running after this audit (healthy) rather than torn down, to
  save re-boot time for the next phase. Tear down with `npm run docker:down` if not needed.
- `docs/AGENT_HANDOFF.md<` (literal `<` in the filename) is a shell-redirection artifact from a prior
  session, not a real file that was ever supposed to keep that name — safe to remove or rename in a later
  cleanup pass.
