# Product Audit — Remote AI Platform

Ground truth as of this audit, built from: a full-source backend/frontend inventory (this session), and a prior session's live browser UI/UX audit (`docs/ui-audit/`, 78 screenshots, all 3 demo roles, both logged-in and logged-out). Nothing here is inferred from the marketing brief — every claim is traceable to source or a screenshot.

## 1. What This Product Actually Is Today
A working two-sided marketplace: engineers discover and apply to real aggregated jobs (5 external sources) and get explainable AI match scores; companies post jobs and browse AI-ranked candidates. A substantial, mostly-hidden freelance-execution layer already exists underneath (`projects`/`contracts`/`payments`/`marketplace` domains: task offers, milestones, sandbox escrow, reviews, AI project planning/risk/documentation). A basic social layer exists (feed, posts, likes, comments, groups, connections, direct messages). Admin tooling is thin (dashboard, users, jobs only).

**This is closer to 65-70% of the brief's ambition already having *some* backend representation than the brief's "60-80% complete, mostly broken" framing suggests** — the backend is broader and more capable than assumed, but badly fragmented in information architecture and entirely unexposed for large parts of it (freelance marketplace, AI project tools) in the current frontend.

## 2. Backend Completion by Product Pillar (from the brief's own "Core Products" framing)

| Pillar | Backend state | Frontend state |
|---|---|---|
| **1. Social Network** | Posts/likes/comments real (`social` domain). Groups real but isolated from posts. Shares, events, articles, polls: **zero backend support**. | `/feed`, `/network`, `/messages`, `/groups` exist and work; no shares/events/articles/polls UI (nothing to build against yet). |
| **2. Career Platform** | Engineer/company profiles, applications, AI matching, job aggregation (5 sources) all real and working. | Fully built: dashboards, job board, applications, recommendations, candidate discovery. This is the most complete pillar end-to-end. |
| **3. Freelance Marketplace** | Substantially built but fragmented: task offers ≈ proposals, `Milestone`/`ContractMilestone`/`WorkLedgerEntry` = 3 overlapping milestone models, sandbox escrow, reviews all exist. | Only partially exposed: `/projects`, `/contracts`, `/payments` pages exist but don't present this as a unified "marketplace" — no proposal-submission UI, no unified milestone timeline. |
| **4. AI Work Operating System** | Real: AI project planning, progress summaries, risk analysis, auto-documentation, AI code/submission review (`quality` domain), AI resume enhancement, AI job matching — 6 distinct AI capabilities already live via a shared `AIService`/LiteLLM client. | Under-surfaced: no dedicated "AI workspace" UI ties these together; `/quality` exists as a standalone unguarded page (see Known Bugs), not integrated into project workflows despite the backend already supporting `POST /projects/{id}/ai/*`. |

## 3. User Model — Current State vs. Brief's Target
**Current**: separate ENGINEER/COMPANY/ADMIN roles baked into routing (`RequireRole(["ENGINEER"])` etc.) and separate `/engineer/*` and `/company/*` route trees — exactly the "separate dashboards" pattern the brief says not to build.
**Real head start already in the backend**: `PATCH /api/v1/auth/role` exists today, letting one `User` row change role — the backend data model is already closer to "one identity" than the frontend's route structure suggests. The redesign's "Personal Workspace / Organization Workspace" concept is achievable by re-skinning navigation and consolidating `/engineer/*` + `/company/*` into workspace-scoped views backed by this same endpoint, not a ground-up backend rewrite of the user model. This should be validated with the backend owner before assuming it's sufficient (e.g., does one `User` cleanly support being simultaneously an active engineer profile AND running a company — need to confirm cardinality), but it's a materially smaller lift than "add multi-tenancy from scratch."

## 4. Known Bugs (carried forward from `docs/ui-audit/BUGS.md`, still unfixed as of this audit)
1. **P1** — Systemic hydration mismatch on nearly every authenticated page.
2. **P1** — `/quality` (real LLM-backed tool) has zero frontend auth gating despite the backend endpoint correctly requiring `get_current_user` — this is a frontend-only fix, confirmed via API_MAPPING.md Part B.
3. **P1** — `/engineer/dashboard` missing role guard; COMPANY/ADMIN accounts get a broken, identity-confused render instead of a redirect.
4. **P2** — Inconsistent auth-gating architecture (`RequireAuth` wrapper vs. ad hoc `useAuth()` checks) across `contracts`/`payments`/`settings`/`quality`.
5. Admin's system-health panel hardcodes Redis/MinIO/Keycloak as "OPERATIONAL" regardless of real status (found in an earlier session).
6. Uncaught `TypeError` on `/network` (`.trim()` on undefined) — needs isolated root cause.

None of these are addressed by this document — they carry forward as inputs to IMPLEMENTATION_PLAN.md.

## 5. Tech Stack Reality Check
| Brief specifies | Actually in repo |
|---|---|
| shadcn/ui | ❌ Not installed. Hand-rolled Tailwind v4 token system + 30 components instead — see DESIGN_SYSTEM.md §2 for the adoption decision this creates. |
| Framer Motion | ❌ Not installed |
| TanStack Query | ✅ Installed (`^5.66.0`), already used everywhere |
| TanStack Table | ❌ Not installed (only Query is present) |
| React Hook Form | ✅ Installed (`^7.54.2`) |
| Zod | ✅ Installed (`^3.24.2`) |
| Zustand | ❌ Not installed |
| Supabase (DB + Storage) | Backend currently uses async SQLAlchemy 2 against Postgres via docker-compose locally, and boto3-based S3-compatible storage (works against MinIO locally, and against Supabase Storage in production per `docs/DEPLOYMENT_ZERO_COST.md`) — i.e. **Supabase Storage is already the production storage target**, but the *database* layer is plain Postgres via SQLAlchemy, not Supabase's client SDK/RLS model. Confirm with the user whether "Supabase PostgreSQL" in the brief means "Postgres hosted by Supabase" (already true in production) or "adopt Supabase's client SDK/row-level-security model" (a real architecture change, not yet done). |

## 6. What NOT to Rebuild
- The existing job-aggregation pipeline (5 working adapters + `JobService.sync_all_job_sources()` + Celery beat schedule) — extend with new adapters, don't replace the pattern.
- The existing AI layer (`AIService` → `LLMClient` → LiteLLM, provider-agnostic, with fallback chain) — this already IS the "AI everywhere" infrastructure the brief wants; the work is surfacing more of its existing capabilities in the UI, plus adding new prompt/agent types for feed summarization, message drafting, etc.
- The existing explainable AI-match visual language (score ring + 6-factor breakdown) — tested and confirmed excellent in the prior UI audit; carry forward, don't replace.
- The existing auth/JWT/role system — extend (workspace-switching UI on top of the existing `PATCH /auth/role`), don't rewrite.

## 7. Highest-Leverage Findings for Planning
1. The freelance-marketplace and AI-work-OS pillars are **much closer to done on the backend than the brief assumes** — the redesign's biggest lift there is frontend IA and consolidating 3 fragmented milestone models, not new backend build-out.
2. The social pillar is the **least backend-complete** of the four core products relative to the brief's ambition (no shares, events, articles, or polls at all) — budget real backend work here, not just frontend.
3. Three concrete P1 bugs need fixing early (ideally in Phase 1, alongside the audit) since they'll otherwise contaminate every subsequent phase's testing baseline.
4. The shadcn/ui and Supabase-client questions in §5 are both genuine open decisions that block starting Phase 2/3 cleanly — recommend resolving them explicitly (see IMPLEMENTATION_PLAN.md Phase 1 deliverables) rather than letting implementation silently pick a default.
