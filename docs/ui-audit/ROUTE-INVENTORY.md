# Route Inventory — Remote AI Platform

Built by reading `apps/web/src/app/**/page.tsx` source directly (not inferred from filenames alone) plus the main nav/sidebar components and `apps/api/app/main.py`. There is **no `apps/web/src/middleware.ts`** — all route protection is client-side, via `RequireAuth`/`RequireRole` React wrapper components or ad hoc `useAuth()` checks inside individual pages.

## Frontend Routes

| Route | Category | Page Title/Heading | Auth Required? | Role Required | Nav Entry | Description |
|---|---|---|---|---|---|---|
| `/` | PUBLIC | "Where remote engineering work meets intelligent hiring." | No | — | Y (Home) | Marketing/landing page |
| `/jobs` | PUBLIC | Job Board | No (actions gated) | — | Y (Jobs) | Public job search/board |
| `/jobs/[id]` | PUBLIC | Job title (dynamic) | No (apply gated) | — | N (via cards) | Job detail page |
| `/engineers` | PUBLIC | Discover Engineers | No | — | Y (Engineers) | Public engineer directory |
| `/engineers/[id]` | PUBLIC | Engineer name (dynamic) | No (connect/message gated) | — | N (via directory) | Public engineer profile |
| `/companies` | PUBLIC | Discover Companies | No | — | Y (Companies) | Public company directory |
| `/companies/[id]` | PUBLIC | Company name (dynamic) | No | — | N (via directory/jobs) | Public company profile |
| `/freelancers` | PUBLIC (stub) | — | No | — | N | **Dead route**: immediately `redirect("/engineers")`, no real content |
| `/quality` | **UNGATED** | AI Quality Engine | **No auth wrapper at all** | — | Y (Sidebar, engineer + admin) | Real LLM-backed code/submission evaluator — confirmed reachable and fully usable while logged out (see BUGS.md) |
| `/auth/login` | AUTH | Sign in to your account | No | — | Y | Login form |
| `/auth/register` | AUTH | Create your account | No | — | Y | 2-step registration wizard |
| `/auth/forgot-password` | AUTH (stub) | "Password reset isn't available yet" | No | — | N (linked from login) | Honest informational stub — no backend reset endpoint exists |
| `/engineer/dashboard` | ENGINEER | Career Dashboard | Yes | **`RequireAuth` only — no role check** | Y | Main engineer dashboard; confirmed loadable by COMPANY/ADMIN accounts (see BUGS.md) |
| `/engineer/profile` | ENGINEER | Create/edit engineer profile | Self-gated via `useAuth()` (supports public view of others) | — | Y | Profile view/edit |
| `/engineer/applications` | ENGINEER | My Applications | Yes | `RequireAuth` | Y | Applications list |
| `/engineer/recommendations` | ENGINEER | AI recommendations | Yes | `RequireRole(["ENGINEER"])` | Y | AI job-match feed |
| `/engineer/workspace` | ENGINEER | Engineer Execution Hub | Yes | `RequireRole(["ENGINEER"])` | Y | Task/offer execution workspace |
| `/company/dashboard` | COMPANY | Hiring Dashboard | Yes | `RequireRole(["COMPANY","ADMIN"])` | Y | Hiring overview |
| `/company/profile` | COMPANY | Create/edit company profile | Yes | `RequireRole(["COMPANY","ADMIN"])` | Y | Company profile |
| `/company/jobs` | COMPANY | Job postings | Yes | `RequireRole(["COMPANY","ADMIN"])` | Y | Company's own job postings |
| `/company/candidates` | COMPANY | Candidate Discovery | Yes | `RequireRole(["COMPANY","ADMIN"])` | Y | Candidate search/matching |
| `/jobs/new` | COMPANY | Post a job or project | Yes | `RequireRole(["COMPANY","ADMIN"])` | N (via company/jobs action) | 5-step job creation wizard |
| `/admin/dashboard` | ADMIN | Admin console | Yes | `RequireRole(["ADMIN"])` | Y | Platform metrics/console |
| `/admin/users` | ADMIN | User Management | Yes | `RequireRole(["ADMIN"])` | Y | User management table |
| `/admin/jobs` | ADMIN | Job Listings | Yes | `RequireRole(["ADMIN"])` | Y | Admin job moderation view |
| `/feed` | SHARED AUTHENTICATED | Social feed | Yes | `RequireAuth` | Y | Social feed |
| `/network` | SHARED AUTHENTICATED | Professional Network | Yes | `RequireAuth` | Y | Connections/network |
| `/messages` | SHARED AUTHENTICATED | Messages | Yes | `RequireAuth` | Y | Conversations |
| `/notifications` | SHARED AUTHENTICATED | Notifications | Yes | `RequireAuth` | Y (bell dropdown) | Full notification list |
| `/groups` | SHARED AUTHENTICATED | Communities | Yes | `RequireAuth` | Y | Groups/communities |
| `/projects` | SHARED AUTHENTICATED | Projects | Yes | `RequireAuth` | Y | Project list |
| `/projects/[id]` | SHARED AUTHENTICATED | Project title (dynamic) | Yes | `RequireAuth` | N (via list) | Project detail/kanban |
| `/contracts` | SHARED AUTHENTICATED (inconsistent) | Contracts | Self-gated via `useAuth()`, **no `RequireAuth` wrapper** | — | Y | Contract list |
| `/contracts/[id]` | SHARED AUTHENTICATED (inconsistent) | Contract title (dynamic) | Self-gated, no wrapper | — | N (via list) | Contract detail |
| `/payments` | SHARED AUTHENTICATED (inconsistent) | Wallet & Payments | Self-gated, no wrapper | — | **N — not in any nav**, direct-URL only | Wallet/escrow/transactions |
| `/settings` | SHARED AUTHENTICATED (inconsistent) | Settings | Self-gated per-tab, no wrapper | — | Y (profile dropdown) | Account settings; Security tab admits password change/session mgmt "aren't available yet" |
| `/workspace` | OTHER (stub) | — | No | — | N | Dead alias: `useEffect` → `router.replace('/engineer/workspace')` |
| ERROR/SYSTEM | — | Next.js default 404 | No | — | N | Confirmed renders for unknown routes |

## Routes Reachable Only via Links/Redirects (not in main nav)
- `/jobs/[id]`, `/engineers/[id]`, `/companies/[id]` — via cards/search results
- `/jobs/new` — via company jobs page "Post a job" action
- `/auth/forgot-password`, `/auth/register` — via login page links
- `/projects/[id]`, `/contracts/[id]` — via their list pages
- `/messages?id={id}` — via "Message" action on an engineer profile
- `/jobs?query=...`, `/jobs?saved=true` — via global search / Sidebar "Saved Jobs"
- `/payments` — no in-app link source found at all; direct URL only
- `/auth/login?redirect=...` — auto-constructed by `RequireAuth`/`RequireRole` guards

## Backend API Domain Prefixes (`apps/api/app/main.py`, all under `/api/v1`)
`health`, `auth`, `engineers`, `companies`, `jobs`, `search`, `matching`, `admin`, `moderation`, `saved_jobs`, `applications`, `projects`, `notifications`, `network`, `social`, `contracts`, `trust`, `payments`, `groups`, `quality`

## Stub / Not-Implemented Pages
- `/freelancers` — pure redirect, no content
- `/workspace` — pure redirect, no content
- `/auth/forgot-password` — real page shell, but functionally: "not available yet"
- `/settings` (Security tab) — partial stub: "Password changes and active-session management aren't available yet"

## Route Count Summary
- **Total distinct page templates**: 33 (some with dynamic segments)
- **Public**: 9 (`/`, `/jobs`, `/jobs/[id]`, `/engineers`, `/engineers/[id]`, `/companies`, `/companies/[id]`, `/freelancers`, `/quality`*)
- **Auth**: 3 (`login`, `register`, `forgot-password`)
- **Engineer**: 5
- **Company**: 5 (incl. `/jobs/new`)
- **Admin**: 3
- **Shared authenticated**: 8 (incl. inconsistently-gated `contracts`, `contracts/[id]`, `payments`, `settings`)
- **Error/system**: 1 (404)

\* `/quality` is counted under Public because it has zero auth gate in practice, despite being designed/navigated-to as an engineer/admin tool.
