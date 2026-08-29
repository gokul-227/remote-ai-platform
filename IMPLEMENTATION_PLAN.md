# Implementation Plan — Remote AI Platform Redesign

## Scope Reality Check (read this before the phases)

The originating brief describes a transformation on the scale of Facebook + LinkedIn + Upwork + Uber + Jira + Stripe, with 150-200 components, a separate admin application, 10+ job-board/ATS integrations, and AI woven through every surface. That is a genuine multi-quarter effort for a real product team (design + frontend + backend + QA + DevOps), not something completed inside one working session. Framing it otherwise would mean either faking completion or silently shrinking scope without saying so — neither is acceptable.

What follows is a plan that can actually be executed, phase by phase, across multiple sessions, with each phase producing a real, verifiable, shippable increment — matching the brief's own instruction that "each phase must compile, pass lint, pass type check, include tests." Phases are ordered by (a) the brief's own phase list, (b) what PRODUCT_AUDIT.md and API_MAPPING.md showed is already close to done vs. genuinely new work, and (c) risk — fixing existing P1 bugs and resolving open architectural decisions happens before new surface area is built on top of them.

**Component count target**: ~100, not 150-200 (see DESIGN_SYSTEM.md §4) — built incrementally, one phase's worth at a time, not upfront.

**Decisions from the user (resolved 2026-08-29)**:
1. shadcn/ui: extend the existing hand-rolled system (DESIGN_SYSTEM.md §2 Option B) — reuse real shadcn/Radix-sourced components (checking license per component) only for genuinely new component categories; do not replace the ~30 working components.
2. "Supabase PostgreSQL": confirmed as already-true "Postgres hosted by Supabase" — no architecture change; continue with SQLAlchemy/asyncpg as-is.
3. Admin: **split into a genuinely separate application** — own Next.js app/deployment, own URL, own auth flow. Scoped as its own initiative (Phase 12), not attempted inside the Phase 2 design-system work. Real DevOps/deployment work: new Vercel project, new render/env config, auth flow decision (shared Keycloak realm vs. separate), CORS updates on the API side.
4. **Start real Stripe Connect integration** to replace the sandbox escrow provider. This has real compliance/KYC implications (Stripe Connect onboarding, webhook signature verification, PCI scope, payout/refund reconciliation) and needs its own dedicated scoping session before implementation — not something to build inside a single response alongside the design-system work. Tracked as its own initiative; Phase 11 (Wallet UI) proceeds against the existing sandbox provider in the meantime so wallet UI work isn't blocked on the gateway decision.

---

## Phase 1 — Audit ✅ (this document set)
**Deliverables** (all in repo root, this commit): `PRODUCT_AUDIT.md`, `API_MAPPING.md`, `DESIGN_SYSTEM.md`, `SCREEN_SPECIFICATION.md`, `IMPLEMENTATION_PLAN.md` (this file). Plus the pre-existing `docs/ui-audit/` (78 screenshots, route/nav/bug inventory from a prior session).
**Also in scope for Phase 1** (not yet done — next actions): fix the 3 P1 bugs found in the UI audit (hydration mismatch, `/quality` auth gate, `/engineer/dashboard` role guard) before building new UI on top of them, since they'd otherwise contaminate every later phase's test baseline.
**Exit criteria**: user has reviewed and confirmed the 4 open decisions above; P1 bugs fixed and re-verified via the existing Playwright audit script.

## Phase 2 — Design System (in progress, 2026-08-29)
**Scope**: resolve the shadcn/ui decision; implement dark-mode token variants; formalize the 8px spacing scale and Inter typography; add CVA-style variant composition to the existing 30 components; build the ~15 net-new primitives needed immediately for Phase 3-5 (combobox, sortable data table via TanStack Table, workspace switcher shell, universal search overlay).
**Progress so far**:
- shadcn/ui decision resolved: extend existing system (DESIGN_SYSTEM.md §2 Option B).
- Dark-mode tokens: already existed in `globals.css` as of this check (added by an earlier, undocumented change — DESIGN_SYSTEM.md §1.1 corrected to reflect this).
- 8px spacing scale (`--space-1` through `--space-16`) and a named typography scale (`--text-xs` through `--text-4xl`) added to `globals.css` as tokens — purely additive, no visual change to existing pages (values match Tailwind's own defaults at each step).
- `Card` component converted to CVA with a `variant` prop (`enterprise|job|profile|metric|ai|project`), consolidating 6 previously-separate CSS classes — 4 of the 6 (`card-job`/`card-profile`/`card-metric`/`card-project`) had **zero usage anywhere in the app** despite being defined; they're now reachable as a real variant instead of dead CSS.
- Still not done: CVA composition for the other 9 primitives without it (Avatar, EmptyState, Drawer, Skeleton, Progress, Input, Toast, Tabs, Table, Modal — Input/Table specifically only need it if/when they gain real size/style variants, not by default); Inter font (current stack is system-ui-based, not Inter — confirm this is actually wanted before switching, since it's a visible change to every page); net-new primitives (Combobox, TanStack-Table-backed sortable data table, workspace switcher shell, universal search overlay); the component-gallery exit-criteria artifact itself.
**Depends on**: Phase 1 decision #1 (resolved above).
**Exit criteria**: Storybook-equivalent component gallery page (or equivalent visual QA artifact) covering every primitive in both light and dark mode; Lighthouse accessibility score baseline recorded for the gallery page. **Not yet met** — tracked as the next concrete increment.

## Phase 3 — App Shell — **already substantially done, verified 2026-08-29 via fresh screenshots**
**Correction**: this phase's "workspace switcher doesn't exist" premise was wrong even at plan-writing time — `WorkspaceSwitcher.tsx` was built in two commits (`aea3edd`, `0a2f7c1`, "Phase C increment 1/2") and is live in the shell today: the top nav shows "Personal Workspace" (engineer) / "Organization Workspace" (company) with a switcher control, confirmed in fresh screenshots of `/engineer/dashboard` and `/company/dashboard`. `RightSidebar` still exists and still appears page-specific rather than a generalized contextual-panel framework — that part of the phase is genuinely still open. No persistent AI assistant entry point was found anywhere in the shell — still open.
**Still open**: generalize `RightSidebar` into a reusable contextual-panel framework; add a persistent AI assistant entry point (UI shell only).
**Depends on**: Phase 1 decision #3 — resolved: admin will be a separate app (Phase 12), so this shell does not need to also serve as the admin shell.

## Phase 4 — Authentication — **not re-verified this pass**
**Scope**: splash, welcome, onboarding wizard (replacing "land on empty profile page"), AI profile import screen wrapping the existing `POST /engineers/me/resume` + `/ai-enhance` endpoints. Forgot-password and email-verification remain stubs unless the user commits to the backend work in PRODUCT_AUDIT.md §4/§7 — do not fake these.
**Note**: given Phase 3/7/9's "already done" corrections below, check `/onboarding` and `/auth/register` against this scope before assuming it's still open — don't repeat the mistake of trusting this doc without a fresh check.
**Exit criteria**: full registration → onboarding → first-dashboard-view flow tested for both Personal and Organization workspace paths.

## Phase 5 — Feed (Social Network core) — **not re-verified this pass**
**Scope**: restyle existing `/feed` under the new shell/design system; this phase does NOT include shares/polls/events/articles (zero backend support today — see API_MAPPING.md) unless the user explicitly greenlights the backend work first.
**Exit criteria**: feed parity with today's functionality (post/like/comment) under the new shell, confirmed via E2E.

## Phase 6 — Profile — **not re-verified this pass**
**Scope**: unify engineer/company profile screens into one persona-agnostic "Profile" surface per the one-identity model; surface the professional identity graph (skills, experience, connections, completed projects, reviews, trust score).
**Exit criteria**: one profile URL serves both "view as engineer" and "view as org" contexts correctly.

## Phase 7 — Jobs — **substantially done, verified 2026-08-29 via fresh screenshots**
**Correction**: the plan assumed AI match panels were still to build. Fresh screenshots of the public `/jobs` page and the engineer dashboard's "Top AI Career Match" card show this already shipped: a real AI match panel with a 93% "Excellent Match" score, an explicit "Why This Position Matches" explanation, and a 6-factor breakdown (Skills Alignment, Experience Level, Role & Seniority Fit, Timezone Compatibility, Target Compensation, Remote Working Fit) with real per-factor percentages, not decorative. Job search/filter UI (remote type, salary range, seniority, tech stack chips) is live and clean.
**Still open**: resume optimizer / cover-letter generator / interview-prep AI panels (not confirmed either way this pass); job aggregator expansion (out of scope per original plan anyway).
**Exit criteria**: existing job-board functionality unchanged in production behavior; at least one new AI panel shipped and demoed — **met** (match explanation).

## Phase 8 — Projects (Freelance Marketplace + AI Work OS overlap) — **not re-verified this pass**
**Scope**: expose the already-built backend depth (task offers/proposals, unified milestones after reconciling the 3 overlapping models per API_MAPPING.md Part C item 1, work submissions, AI planning/progress/risk/documentation panels).
**Exit criteria**: a real project can be created, staffed via a proposal/offer, tracked through a unified milestone timeline, and the AI panels (plan/progress/risk/docs) all produce real output against real project data.

## Phase 9 — Organization Workspace — **substantially done, verified 2026-08-29 via fresh screenshots**
**Correction**: the plan assumed the hiring pipeline was still a kanban-to-build. Fresh screenshot of `/company/dashboard` shows a "Hiring Command Center" already shipped with real metrics (active roles, pipeline count, active projects, talent pool size), an open-positions list, a hiring pipeline progress bar, recent applications with review status, and a top-talent list.
**Still open**: interviews/team/org-analytics (flagged in the original plan as needing new backend models — cardinality/scope questions from PRODUCT_AUDIT.md §3 still apply, not re-verified this pass).
**Exit criteria**: hiring pipeline ships against existing data — **met**; interviews/team/analytics still need their scope question answered before committing to them.

## Phase 10 — AI Workspace — **not re-verified this pass**
**Scope**: a dedicated surface unifying the AI capabilities that already exist across engineers/jobs/matching/projects/quality domains into one coherent "AI assistant" experience.
**Exit criteria**: every AI capability is reachable from a contextual entry point in the relevant surface, not just via direct API calls.

## Phase 11 — Wallet — **not re-verified this pass**
**Scope**: restyle `/payments` under the new shell, fix its orphaned-from-nav status, wire into the workspace switcher. Per the resolved decision, real Stripe Connect integration is tracked as its own initiative (not blocking this phase) — ship this phase against the existing sandbox provider, clearly labeled.
**Exit criteria**: wallet reachable from nav in both Personal and Organization workspace; all existing sandbox escrow flows (create/release/refund) work identically to today.

## Phase 12 — Admin Application — **admin UI quality confirmed good; separate-app split not started**
**Correction**: the plan's "fix the known system-health hardcoding bug" item is done — fresh screenshot of `/admin/dashboard` confirms Keycloak shows honestly as `DOWN` (a real check, not hardcoded green) while Postgres/Redis/MinIO/Celery show real per-service latencies; platform metrics, AI token cost monitoring, job-source sync status, and moderation queue are all real and wired to live data.
**Given the resolved decision** (split into a separate app): none of the actual DevOps work has started — new Next.js app, new Vercel project, auth flow decision, CORS updates. The good admin UI that exists today still lives inside the main app and would need to move.
**Exit criteria**: system-health panel reports real status — **met** (in current integrated location); separate-app migration — not started.

---

## Testing Requirements (every phase)
Reuse the existing Playwright E2E infrastructure (`tests/e2e/`, already covers register/login/job-posting journeys) and extend it per phase rather than building a parallel test system. Every phase's exit criteria above already implies a specific E2E scenario to add. Responsive (390/768/1024/1440) and accessibility checks should reuse the same audit script pattern established in `docs/ui-audit/` rather than inventing new tooling.

## Deployment Requirements (every phase)
Ship each phase to production (Vercel + Render, per the existing working deployment pipeline) before starting the next phase — this matches the brief's own "deploy safely, verify production" instruction and keeps risk small per increment, rather than accumulating 12 phases of unverified change before the first production check.

## What This Plan Deliberately Does Not Promise
- A completed 150-200 component library, a fully separate admin application, 10+ job-board integrations, and a live payment gateway are all NOT included by default — each requires an explicit go/no-go from the user at the relevant phase boundary, with real cost (mostly backend/DevOps, not frontend styling) called out at that point.
- Nothing in this plan claims work is "done" until it's been verified the way the prior sessions in this project verified things: real browser testing, real screenshots, real CI runs, real production checks — not code-exists-therefore-it-works reasoning.
