# Enterprise Capability Matrix

Generated 2026-08-29 by direct code inspection (not by trusting prior "certification" docs).
Scope: every backend domain, the AI layer, job aggregators, Celery/observability, and the
frontend route/auth surface. Status legend: **IMPLEMENTED** (real, correct) / **PARTIAL**
(works but has real gaps) / **MOCKED** (fake/simulated, possibly undisclosed) / **BROKEN**
(genuine defect) / **NOT_WIRED** (exists but unreachable).

## Fixed during this pass

| Issue | Severity | Status |
|---|---|---|
| Render deployed 43 commits stale + wrong health-check path → prod effectively unmonitored | P0 | Fixed & verified live |
| `NextResponse` imported from `next/navigation` (doesn't exist) — broke frontend CI build for 5 commits | P0 (CI) | Fixed |
| 6 pages crashed (`Objects are not valid as a React child`) when the backend returned a structured 422 `detail` array — this is what the E2E suite's "page couldn't load" failure actually was | P1 | Fixed, shared `extractErrorMessage()` helper added |
| **`GET /notifications/ws/{user_id}` had zero authentication — any client could read any user's real-time notifications by guessing a UUID** | **P0 (security)** | **Fixed & verified (no-token/wrong-user/valid-user all behave correctly)** |
| `trust` domain auto-set `status="VERIFIED"` on self-submitted credentials with zero evidence check, feeding fake "verified" signals into trust scores shown to other users | P1 (product truth) | Fixed: submissions now start `SELF_REPORTED`; a new admin-only `PATCH /trust/verifications/{id}/review` is the only path to `VERIFIED`, backed by an audit event; trust score only counts true `VERIFIED` badges; existing auto-verified rows retroactively reclassified via migration; frontend now shows each badge's real review status instead of implying instant verification |
| `GET /engineers/{profile_id}` (fully unauthenticated) serialized `resume_url` — a permanent, non-expiring storage URL — to any anonymous caller; bulk listing/search endpoints did the same at scale | P2→fixed (not exploitable today since MinIO denies anonymous bucket reads, but a real gap that would become full resume exfiltration if bucket ACLs loosen or production switches to Supabase Storage with different defaults) | Fixed: `resume_url`/`parsed_resume_data` removed entirely from the bulk `list`/`search` public schema; the single-profile detail endpoint now nulls both fields for anonymous callers via an optional-auth dependency, while still serving them to any authenticated caller (preserves the existing "view resume" UI feature on `/engineers/[id]`) |

## Full BOLA/IDOR sweep (live, against a running local stack)

Ran cross-tenant authorization tests (two independent users per role, real registered accounts, real tokens) against every domain not already covered by the fixes above: engineers/companies/jobs/matching, applications/contracts/projects, payments/groups/network/saved_jobs, admin/notifications/storage. **Result: clean.** Every ownership/membership/role check correctly returned 403/404 for cross-tenant access and non-owned/non-existent resource IDs; no 200/500/data-leak was found except the resume_url issue above (now fixed). Two minor, non-cross-tenant, non-exploited observations worth a follow-up if stricter internal role separation is desired:
- `PATCH /projects/tasks/{task_id}` lets any project member (not just the assigned engineer/company owner/admin) reassign a task to an arbitrary user.
- `update_member_role` (groups) checks the caller's admin role but not whether that admin membership is `active` — currently unreachable in practice since no code path can create a non-active admin membership.

## Backend domains — mature (models/schemas/repository/service/router)

| Domain | Status | Notes |
|---|---|---|
| auth | IMPLEMENTED | Full register/login/refresh/reset/logout-all flow. No DEBUG-mode mock-user bypass (explicitly removed, documented in code). |
| engineers | IMPLEMENTED | AI profile enhancement calls a real `AIService`, not a stub. |
| companies | IMPLEMENTED | Small but complete. |
| jobs | IMPLEMENTED | Minor gap: `POST /seed_demo` has no auth dependency at all outside production (only an `is_production` check), and swallows errors silently (`except Exception: pass`). Low risk (non-prod only) but should have a role check regardless. |
| matching | IMPLEMENTED | Ownership checks done correctly in-handler where role dependency isn't granular enough. |
| admin | IMPLEMENTED | The previously-known "hardcoded Redis/MinIO/Keycloak = OPERATIONAL" bug **is already fixed** — real PING/list-buckets/realm-fetch checks with timeouts now exist (`admin/router.py` `_check_redis`/`_check_minio`/`_check_keycloak`). |
| trust | PARTIAL (verification lifecycle fixed this pass) | Missing `repository.py` (raw queries in router/service) — cosmetic layering gap, not a correctness issue. The fake-verification defect (`status="VERIFIED"` on self-submission) is fixed: see the fix table above. |

## Backend domains — thinner (router-only or partial layering)

| Domain | Status | Notes |
|---|---|---|
| saved_jobs | PARTIAL | Thin but functional CRUD. |
| applications | PARTIAL | Functional, no repository/service split. |
| projects | IMPLEMENTED (monolithic) | Most built-out domain — full milestone/task/ledger/escrow/review/AI-planning lifecycle, but 1536 lines all in `router.py`. **Duplicates escrow logic** also present in `payments` domain (both call the same `SandboxPaymentProvider`). |
| notifications | PARTIAL → now includes the WS auth fix above | REST endpoints solid. |
| network | PARTIAL | Connections + messaging; messaging WebSocket auth is correctly implemented (this was the reference pattern used to fix notifications). |
| search | **BROKEN/STUB** | `models.py` is empty (0 lines); only a single unbacked `GET` endpoint exists. |
| social | IMPLEMENTED | Full feed/post/like/comment. |
| contracts | PARTIAL | Real status state-machine exists, but contract→project transition looks like a manual convenience mapping, not an automated lifecycle trigger. |
| payments | **MOCKED (disclosed in code, not necessarily to end users)** | `SandboxPaymentProvider` is explicitly documented as a fake adapter that "never contacts a payment network." Idempotency exists only for escrow *creation* — release/refund have none, and **there is no webhook endpoint at all**, so webhook idempotency/replay protection doesn't apply. Frontend/product copy should be checked to confirm this sandbox status is disclosed to users, not just to developers reading the code. |
| groups | IMPLEMENTED | Full CRUD + membership + posts. |
| quality | PARTIAL | Stateless AI wrapper, no persistence — consistent with an AI evaluation tool rather than a gap. |
| marketplace | **NOT_WIRED as a product surface, but NOT dead code** | Correction after deeper inspection: `marketplace/models.py` defines `ProjectTask`, which is the actual task table the fully-implemented `projects` domain operates on via foreign keys (`TaskComment`, `TaskDependency`, `TaskAssignmentOffer`, `WorkSubmission` in `projects/models.py` all reference it). There is no standalone "marketplace" API/router and none is wired into `main.py` — but the model itself is load-bearing infrastructure, not an orphaned stub. If the product intends a separate "marketplace" surface, that still needs building; if not, the current state (shared task model, no dedicated router) is actually fine as-is. |

## AI layer — clean

- All calls route through LiteLLM (verified zero direct `openai`/`anthropic` SDK imports).
- Real fallback chain across configured models; on total failure returns safe empty defaults, never a raised exception and never fabricated realistic content pretending to be a real AI answer.
- Gap: failures are recorded in the `AIUsageLog` DB table but not surfaced to the API caller — a sparse-but-successful AI response is indistinguishable from a failed one at the response level.
- Gap: no first-class request-ID correlating a single AI call across logs (provider/latency/tokens are tracked; a dedicated trace ID is not).

## Job aggregators — real, with one real gap

- All 5 sources (RemoteOK, Arbeitnow, Remotive, USAJobs, TheMuse) make genuine `httpx` calls to real external APIs — none are hardcoded/fixture data.
- Per-source failure isolation is real (one source failing doesn't stop the sync loop).
- **No cross-source deduplication** — the same job posted on two boards is stored as two separate rows (dedup only works within a single source, keyed by prefixed external ID).

## Celery / workers / observability

- `sync-all-job-sources` (6h beat) is real. **`refresh-trending-skills` (12h) and `compute-stale-matches` (daily) are pure stubs** — they log a message and return `{"status": "ok"}` with zero actual work, regardless of whether Celery ever runs.
- Production truthfully has no dedicated Celery/Redis service (by design, documented in `render.yaml`); job-source sync in prod runs via a GitHub Actions cron instead. The two stubbed beat tasks would never run anywhere even if Celery were deployed.
- `RateLimitMiddleware` is a real Redis-backed sliding-window limiter with an in-process deque fallback — not a passthrough. In production (no `REDIS_URL` configured) it silently runs in the in-process-only mode, which is fine for the current single-instance free-tier deployment but would silently stop working correctly under any horizontal scaling.
- Structured logging with request-ID propagation is real; no secret/token/password leakage found in any log call site.

## Frontend

- Auth hydration uses `useSyncExternalStore` correctly — no hydration mismatch class of bug.
- Every route is reachable from real navigation (no dead pages found), and no hardcoded fake data was found presented as real.
- Two minor gating inconsistencies: `/engineer/profile` has no `RequireAuth`/`RequireRole` wrapper (relies only on a disabled query when logged out); `/engineer/applications` is `RequireAuth`-only, not role-restricted to ENGINEER.

## Not yet investigated (out of scope for this pass)

Phases not covered here: full E2E journey re-verification post-fixes, accessibility (WCAG), performance/N+1 queries, storage authorization deep-dive, soft-delete correctness, admin operations console completeness, and a full security/BOLA sweep beyond what surfaced incidentally above. Recommend one of these as the next focused pass rather than attempting all simultaneously.
