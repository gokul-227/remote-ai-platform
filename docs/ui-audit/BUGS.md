# Bugs Found During UI/UX Audit

All findings below were confirmed by actually loading the page in a real browser (Playwright, against the local docker-compose stack: frontend `localhost:3000`, backend `localhost:8000`) and inspecting console errors, network requests, and rendered output — not inferred from source code alone. Severity uses P0 (unusable) → P3 (cosmetic).

---

### BUG-01 — P1 — Hydration mismatch on almost every authenticated page
**Where**: `/engineer/dashboard`, `/engineer/profile`, `/engineer/recommendations`, `/engineer/applications`, `/engineer/workspace`, `/jobs` (while authed), `/jobs/[id]` (while authed), `/feed`, `/network`, `/messages`, `/notifications`, `/groups`, `/projects`, `/settings`, `/contracts`, `/payments`, `/quality`, `/company/dashboard`, `/company/profile`, `/company/candidates`, `/company/jobs`, `/jobs/new`, `/admin/dashboard`, `/admin/users`, `/admin/jobs` — essentially every page reached after login.

**Error** (identical on every page):
```
Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:
- A server/client branch `if (typeof window !== 'undefined')`.
- Variable input such as `Date.now()` or `Math.random`.
```
Confirmed visually via the Next.js dev-mode error overlay ("1 Issue" red badge, bottom-left corner) present on nearly every authenticated screenshot.

**Likely cause**: something shared across the authenticated layout (top nav, sidebar, or a wrapping provider) reads `window`/`localStorage`/a random/time value during initial render without guarding for SSR, so the server-rendered markup differs from the first client render. Because it's present on every authenticated page but never on public pages, it's almost certainly in the authenticated shell/layout component (e.g. `RequireAuth`/`RequireRole`, or the auth-aware top nav), not in individual pages.

**Impact**: Not currently blocking (React recovers by discarding and re-rendering the tree client-side), but this means every authenticated page currently pays a full client-side re-render, and is a real correctness bug worth root-causing before the redesign — a redesign built on top of this will inherit and likely obscure it further.

**Screenshots**: any authenticated screenshot in `screenshots/` shows the dev overlay badge; see `40-engineer-dashboard-desktop.png`, `60-company-dashboard-desktop.png`, `80-admin-dashboard-desktop.png` for clear examples.

**Concrete mobile consequence confirmed**: on the 390px mobile viewport, this dev-mode error badge renders as a fixed pill in the bottom-left corner that **visually overlaps the mobile bottom navigation bar**, directly covering the "Feed"/"Home" and partially the "Jobs" icons on both `/engineer/dashboard` and `/company/dashboard` (`40-engineer-dashboard-mobile.png`, `60-company-dashboard-mobile.png`). This overlay is a Next.js dev-mode-only indicator (won't appear in a production build), but it is a direct visible symptom of the underlying hydration bug and confirms this isn't just a console-log curiosity — it's a real rendering defect worth fixing before relying on mobile screenshots as a clean redesign baseline.

---

### BUG-02 — P1 — `/engineer/dashboard` has no role guard; COMPANY/ADMIN accounts can load it directly and get a broken, confusing page
**Where**: `/engineer/dashboard`

**Repro**: Logged in as `company@workmesh.ai`, navigated directly to `/engineer/dashboard`. Page renders fully (no redirect) but:
- Header reads "Good morning, Acme" (the company's own name in an engineer-persona greeting)
- Shows "0% Profile Strength", "Complete your engineer profile" CTA — nonsensical for a company account
- "No AI matches yet — Complete your engineer profile so we can compute explainable matches" shown to a company user who has no engineer profile
- Console/network: `404 GET /api/v1/engineers/me`, `404 GET /api/v1/matching/recommendations?limit=20` (fired twice each)
- Same behavior reproduced logged in as `admin@workmesh.ai`

**Root cause**: `/engineer/dashboard` is wrapped only in `RequireAuth` (any logged-in user), not `RequireRole(["ENGINEER"])` like its sibling pages `/engineer/recommendations` and `/engineer/workspace` correctly are.

**Impact**: A company or admin user who bookmarks/guesses this URL, or clicks a stale link, sees a broken, identity-confusing dashboard instead of being redirected — this is both a UX and a minor information-boundary issue (their own account name/data is echoed into the wrong persona's UI).

**Screenshots**: `74-company-tries-engineer-dashboard.png`, `83-admin-tries-engineer-dashboard.png`

---

### BUG-03 — P1 — `/quality` (AI code/submission evaluator) has zero auth gating and is fully usable by anonymous visitors
**Where**: `/quality`

**Repro**: Opened `/quality` in a completely logged-out browser context. The full "AI Quality Engine" tool renders — "Submission Evaluator" and "Code Reviewer" tabs, a complete form (Task Title, Task Description, Acceptance Criteria, Submission Content), and a working "Evaluate with AI" button — with the top nav showing "Sign In"/"Join Now" (confirming the session truly is logged out).

**Root cause**: unlike every other engineer/company/admin-facing page, `/quality`'s page component has no `RequireAuth`/`RequireRole` wrapper and no internal `useAuth()` gate at all.

**Impact**: This page's "Evaluate with AI" action almost certainly calls a real LLM-backed backend endpoint (`/api/v1/quality/...`, per the registered router). An unauthenticated visitor can invoke this repeatedly with no rate limiting tied to identity — this is a real unmetered-AI-cost / abuse-surface concern, not just an IA inconsistency.

**Screenshot**: `22-guard-quality-loggedout-check.png`

---

### BUG-04 — P2 — Inconsistent auth-gating architecture across "shared authenticated" pages
**Where**: `/contracts`, `/contracts/[id]`, `/payments`, `/settings`

**Finding**: Unlike `/feed`, `/network`, `/messages`, `/notifications`, `/groups`, `/projects` (which all use the `RequireAuth` wrapper component), these four pages instead self-gate ad hoc via an internal `useAuth()` check, each handling the logged-out case slightly differently (some show a sign-in prompt, `/quality` — see BUG-03 — has no gate at all). This isn't a single bug so much as an architectural inconsistency that makes the auth boundary harder to reason about and easy to regress (as BUG-03 demonstrates).

**Impact**: Elevated risk of exactly the kind of gap seen in BUG-03 recurring on any future page built by copying one of these four instead of the `RequireAuth` pattern.

---

### BUG-05 — P3 — Unresolvable external logo requests (`logo.clearbit.com`)
**Where**: `/jobs`, `/jobs` (authed), `/engineer/dashboard`

**Finding**: Console shows `net::ERR_NAME_NOT_RESOLVED` for `https://logo.clearbit.com/openai.com` and `https://logo.clearbit.com/retool.com`, used as company-logo fallback images for aggregated job listings.

**Caveat — inconclusive**: This audit's sandboxed test environment blocks arbitrary external DNS resolution, so this failure may be an artifact of the sandbox network policy rather than a real production issue (Clearbit's logo API is a real, normally-reachable public service). **This needs re-verification against an unrestricted network** (e.g., the production Vercel deployment) before treating it as a confirmed defect. Flagged here for completeness per the "don't hide errors" mandate, not as a confirmed bug.

---

### BUG-06 — P3 — Un-decoded HTML entity in aggregated job data (carried over from prior session's production smoke test)
**Where**: job listings sourced from external aggregators

**Finding**: At least one aggregated listing renders a literal `&amp;` instead of `&` (e.g. "Fairmont Hotels &amp; Resorts"), indicating the source aggregator delivers pre-escaped HTML in a plain-text field. Cosmetic; traced to aggregator data quality, not the frontend/backend code owned by this repo.

---

## Non-Bugs Confirmed During This Audit (ruled out to avoid false positives)
- **`/engineers/[id]` 404**: initially appeared broken in a raw test run; root-caused to the *test script* using the wrong ID field (`user_id` instead of `id`). The frontend itself correctly links via `engineer.id`; the public engineer profile page works correctly.
- **"Stuck loading" skeletons on dashboards**: transient — Render/local cold-start or first-load latency; all panels resolve correctly given enough wait time (confirmed via extended polling), and the underlying API calls all return 200 with real data.
