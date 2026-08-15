# Implementation Plan — Remote AI Platform Redesign

## Scope Reality Check (read this before the phases)

The originating brief describes a transformation on the scale of Facebook + LinkedIn + Upwork + Uber + Jira + Stripe, with 150-200 components, a separate admin application, 10+ job-board/ATS integrations, and AI woven through every surface. That is a genuine multi-quarter effort for a real product team (design + frontend + backend + QA + DevOps), not something completed inside one working session. Framing it otherwise would mean either faking completion or silently shrinking scope without saying so — neither is acceptable.

What follows is a plan that can actually be executed, phase by phase, across multiple sessions, with each phase producing a real, verifiable, shippable increment — matching the brief's own instruction that "each phase must compile, pass lint, pass type check, include tests." Phases are ordered by (a) the brief's own phase list, (b) what PRODUCT_AUDIT.md and API_MAPPING.md showed is already close to done vs. genuinely new work, and (c) risk — fixing existing P1 bugs and resolving open architectural decisions happens before new surface area is built on top of them.

**Component count target**: ~100, not 150-200 (see DESIGN_SYSTEM.md §4) — built incrementally, one phase's worth at a time, not upfront.

**Decisions needed from the user before Phase 2 can start** (flagged, not assumed):
1. shadcn/ui: adopt (with a token bridge) or extend the existing hand-rolled system? (DESIGN_SYSTEM.md §2 recommends extending, but this is the user's call.)
2. "Supabase PostgreSQL": does this mean the already-true "Postgres hosted by Supabase," or adopting Supabase's client SDK/RLS model as a real architecture change?
3. Admin as a genuinely separate application/deployment (own Vercel project, own URL, own auth flow) — confirm this is worth the deployment/DevOps overhead versus a role-gated section of the same app (which is what exists today and already works).
4. Real payment gateway integration (Stripe Connect, matching the brief's own "Stripe" inspiration) to replace the sandbox escrow provider — this is new backend scope with real compliance/KYC implications, worth scoping as its own initiative rather than folding into "Phase 11: Wallet."

---

## Phase 1 — Audit ✅ (this document set)
**Deliverables** (all in repo root, this commit): `PRODUCT_AUDIT.md`, `API_MAPPING.md`, `DESIGN_SYSTEM.md`, `SCREEN_SPECIFICATION.md`, `IMPLEMENTATION_PLAN.md` (this file). Plus the pre-existing `docs/ui-audit/` (78 screenshots, route/nav/bug inventory from a prior session).
**Also in scope for Phase 1** (not yet done — next actions): fix the 3 P1 bugs found in the UI audit (hydration mismatch, `/quality` auth gate, `/engineer/dashboard` role guard) before building new UI on top of them, since they'd otherwise contaminate every later phase's test baseline.
**Exit criteria**: user has reviewed and confirmed the 4 open decisions above; P1 bugs fixed and re-verified via the existing Playwright audit script.

## Phase 2 — Design System
**Scope**: resolve the shadcn/ui decision; implement dark-mode token variants; formalize the 8px spacing scale and Inter typography; add CVA-style variant composition to the existing 30 components; build the ~15 net-new primitives needed immediately for Phase 3-5 (combobox, sortable data table via TanStack Table, workspace switcher shell, universal search overlay).
**Depends on**: Phase 1 decision #1.
**Exit criteria**: Storybook-equivalent component gallery page (or equivalent visual QA artifact) covering every primitive in both light and dark mode; Lighthouse accessibility score baseline recorded for the gallery page.

## Phase 3 — App Shell
**Scope**: workspace switcher (Personal/Organization), consolidating the current separate `/engineer/*` and `/company/*` route trees behind one shell driven by the existing `PATCH /auth/role` endpoint; right contextual panel framework (generalizing the existing page-specific `RightSidebar`); persistent AI assistant entry point (UI shell only — wiring real AI behind it happens per-surface in later phases).
**Depends on**: Phase 1 decision #3 (does this shell also serve as the admin shell, or is admin truly separate).
**Exit criteria**: existing engineer/company/admin flows all still work identically through the new shell (regression-tested against the existing E2E suite); new workspace-switcher flow demoed end to end.

## Phase 4 — Authentication
**Scope**: splash, welcome, onboarding wizard (replacing "land on empty profile page"), AI profile import screen wrapping the existing `POST /engineers/me/resume` + `/ai-enhance` endpoints. Forgot-password and email-verification remain stubs unless the user commits to the backend work in PRODUCT_AUDIT.md §4/§7 — do not fake these.
**Exit criteria**: full registration → onboarding → first-dashboard-view flow tested for both Personal and Organization workspace paths.

## Phase 5 — Feed (Social Network core)
**Scope**: restyle existing `/feed` under the new shell/design system; this phase does NOT include shares/polls/events/articles (zero backend support today — see API_MAPPING.md) unless the user explicitly greenlights the backend work first. Flag this scope boundary in the phase kickoff so it isn't silently dropped or silently faked.
**Exit criteria**: feed parity with today's functionality (post/like/comment) under the new shell, confirmed via E2E.

## Phase 6 — Profile
**Scope**: unify engineer/company profile screens into one persona-agnostic "Profile" surface per the one-identity model; surface the professional identity graph (skills, experience, connections, completed projects, reviews, trust score) — most of this data already exists across `engineer_profiles`, `trust`, `projects.project_reviews`; this is real aggregation/frontend work, not new backend modeling.
**Exit criteria**: one profile URL serves both "view as engineer" and "view as org" contexts correctly.

## Phase 7 — Jobs
**Scope**: restyle `/jobs`, `/jobs/[id]`, `/jobs/new` under the new shell; add AI panels (match explanation, resume optimizer, cover-letter generator, interview prep) — these are new prompt/agent work on top of the existing `AIService`, not new infrastructure. Job aggregator expansion (Greenhouse/Lever/Ashby/etc.) is out of scope for this phase — track as a separate backend initiative per API_MAPPING.md Part C item 5.
**Exit criteria**: existing job-board functionality unchanged in production behavior; at least one new AI panel (recommend: match explanation, since `matching.JobMatch` already stores factor scores) shipped and demoed.

## Phase 8 — Projects (Freelance Marketplace + AI Work OS overlap)
**Scope**: this is the highest-leverage phase per SCREEN_SPECIFICATION.md — expose the already-built backend depth (task offers/proposals, unified milestones after reconciling the 3 overlapping models per API_MAPPING.md Part C item 1, work submissions, AI planning/progress/risk/documentation panels). Ship the Project Workspace "AI" tab first (5 endpoints already exist and work) as the fastest, highest-value increment.
**Exit criteria**: a real project can be created, staffed via a proposal/offer, tracked through a unified milestone timeline, and the AI panels (plan/progress/risk/docs) all produce real output against real project data.

## Phase 9 — Organization Workspace
**Scope**: hiring pipeline (kanban over existing application-status transitions), candidates, interviews (⚠️ new backend model needed — flag before committing to this in-phase), team (⚠️ new backend model needed if "team" means multiple humans per org account — confirm cardinality question from PRODUCT_AUDIT.md §3 first), org-scoped analytics (⚠️ new backend endpoint needed).
**Exit criteria**: hiring pipeline ships against existing data; interviews/team/analytics either ship with their required new backend work explicitly scoped and estimated, or are explicitly deferred with a stated reason — never silently faked with static data.

## Phase 10 — AI Workspace
**Scope**: a dedicated surface unifying the AI capabilities that already exist across engineers/jobs/matching/projects/quality domains (6 distinct AI capabilities per PRODUCT_AUDIT.md §2) into one coherent "AI assistant" experience, per the brief's "contextual AI, not a chatbot" principle. This is primarily an integration/IA phase, not new AI infrastructure.
**Exit criteria**: every AI capability listed in PRODUCT_AUDIT.md §2 is reachable from a contextual entry point in the relevant surface (feed, profile, jobs, hiring, projects, messages), not just via direct API calls.

## Phase 11 — Wallet
**Scope**: restyle `/payments` under the new shell, fix its orphaned-from-nav status (BUGS.md finding), wire into the workspace switcher. **Explicitly does not include real payment gateway integration** (Phase 1 decision #4) — ship clearly labeled as sandbox/demo mode unless that decision is made and scoped separately.
**Exit criteria**: wallet reachable from nav in both Personal and Organization workspace; all existing sandbox escrow flows (create/release/refund) work identically to today.

## Phase 12 — Admin Application
**Scope**: depends entirely on Phase 1 decision #3. If genuinely separate: new Next.js app or route group with its own auth flow, own Vercel deployment target, own URL — real DevOps work, not just a frontend screen. If staying integrated: fix the known system-health hardcoding bug, add the missing organizations/projects/payments/audit-log/moderation screens identified as gaps in SCREEN_SPECIFICATION.md. Feature flags are new backend scope either way.
**Exit criteria**: admin system-health panel reports real status (bug fixed); all screens in SCREEN_SPECIFICATION.md's Admin table marked EXISTS or PARTIAL are shipped; NET-NEW items (feature flags) explicitly scoped as a follow-on, not faked.

---

## Testing Requirements (every phase)
Reuse the existing Playwright E2E infrastructure (`tests/e2e/`, already covers register/login/job-posting journeys) and extend it per phase rather than building a parallel test system. Every phase's exit criteria above already implies a specific E2E scenario to add. Responsive (390/768/1024/1440) and accessibility checks should reuse the same audit script pattern established in `docs/ui-audit/` rather than inventing new tooling.

## Deployment Requirements (every phase)
Ship each phase to production (Vercel + Render, per the existing working deployment pipeline) before starting the next phase — this matches the brief's own "deploy safely, verify production" instruction and keeps risk small per increment, rather than accumulating 12 phases of unverified change before the first production check.

## What This Plan Deliberately Does Not Promise
- A completed 150-200 component library, a fully separate admin application, 10+ job-board integrations, and a live payment gateway are all NOT included by default — each requires an explicit go/no-go from the user at the relevant phase boundary, with real cost (mostly backend/DevOps, not frontend styling) called out at that point.
- Nothing in this plan claims work is "done" until it's been verified the way the prior sessions in this project verified things: real browser testing, real screenshots, real CI runs, real production checks — not code-exists-therefore-it-works reasoning.
