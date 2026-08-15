# API Mapping — Remote AI Platform

Built by reading real source: `apps/api/app/domains/*/router.py`+`models.py`, `apps/api/app/main.py`, and `apps/web/src/app/**/page.tsx` + `apps/web/src/hooks/`. This is ground truth for the redesign, not the aspirational architecture in the original brief — several counts differ from the brief's assumptions (19 domains exist, not 21; only 5 job aggregators exist, not 10+).

---

## Part A — Backend Domain → Endpoints → Tables

19 domains under `apps/api/app/domains/`. 18 have a `router.py` mounted in `main.py`; `marketplace` is models-only (headless — no API surface, but its tables are load-bearing for other domains).

### auth (`/api/v1/auth`) — table: `users`
`POST /register`, `POST /token`, `POST /login`, `POST /refresh`, `POST /logout`, `GET /me`, `POST /sync`, `GET /login-url`, `GET /logout-url`, `PATCH /role`

> **Redesign-relevant**: `PATCH /auth/role` already exists — the backend already supports switching a user's role on one account. This is a real head start toward the brief's "one identity, multiple workspaces" model; it is not currently exposed anywhere in the frontend UI.

### engineers (`/api/v1/engineers`) — table: `engineer_profiles` (+ writes `ai_reports`)
`GET /`, `GET /me`, `POST /me`, `PUT /me`, `POST /me/ai-enhance`, `POST /me/resume`, `GET /search`, `GET /{profile_id}`

### companies (`/api/v1/companies`) — table: `company_profiles` — **thin/stub domain**
`GET /me`, `POST /me`, `PUT /me`, `GET /public`, `GET /{company_id}`

### jobs (`/api/v1/jobs`) — table: `job_posts` (+ writes `ai_reports`)
`GET /`, `GET /company`, `GET /company/{company_id}`, `GET /{job_id}`, `PATCH /{job_id}`, `POST /`, `POST /sync`, `POST /seed_demo`
Aggregators (`apps/api/app/domains/jobs/aggregators/`): `remoteok.py`, `arbeitnow.py`, `remotive.py`, `themuse.py`, `usajobs.py` — **exactly 5, confirmed by full-tree grep**. Zero Greenhouse/Lever/Ashby/Workday/Adzuna/Jobicy/Bundesagentur code exists anywhere.

### search (`/api/v1/search`) — no dedicated table, fans out to jobs + engineers — **thin/stub**
`GET /`

### matching (`/api/v1/matching`) — table: `job_matches`
`GET /recommendations`, `GET /jobs/{job_id}`, `GET /candidates/{job_id}`, `PATCH /{match_id}/status`

### admin (`/api/v1/admin`) — tables: `activity_logs`, `api_sync_logs`, `moderation_reports` (+ reads across domains)
`GET /dashboard`, `GET /stats`, `GET /sync-logs`, `GET /activity-logs`, `GET /users`, `PATCH /users/{id}/status`, `PATCH /jobs/{id}/status`, `GET /ai-usage`, `GET /health/details`

> **Known defect carried over from the UI audit**: `GET /health/details`'s Redis/MinIO/Keycloak rows are hardcoded `OPERATIONAL` regardless of real status — see prior audit finding, still unfixed.

### admin.moderation (`/api/v1/moderation`) — table: `moderation_reports`
`POST /reports`, `GET /reports`, `PATCH /reports/{id}`

### saved_jobs (`/api/v1/saved-jobs`) — table: `saved_jobs` — **thin/stub**
`GET /`, `POST /{job_id}`, `DELETE /{job_id}`

### applications (`/api/v1/applications`) — table: `job_applications`
`GET /me`, `POST /jobs/{job_id}`, `PATCH /{id}/withdraw`, `GET /company`, `POST /jobs/{job_id}/invite/{engineer_id}`, `PATCH /{id}/status`

### projects (`/api/v1/projects`) — **largest domain**, 11 tables: `projects`, `project_members`, `milestones`, `task_comments`, `task_dependencies`, `task_assignment_offers`, `work_submissions`, `work_ledger_entries`, `payment_transactions`, `project_reviews`, `project_activity` (+ reads/writes `marketplace.ai_reports`/`project_tasks`)
36 endpoints spanning: project/task/milestone CRUD, task-offer marketplace, work submissions + AI review, ledger, sandbox escrow, reviews, AI planning/progress/risk/documentation, activity feed. Full list in the agent-sourced appendix below.

> **This is already the de-facto freelance-marketplace backend** the brief asks for — proposals (task offers), milestones, escrow, reviews all exist here. It is not "build from scratch," it's "consolidate and expose."

### notifications (`/api/v1/notifications`) — table: `notifications` — **thin/stub**
`GET /`, `GET /unread-count`, `PATCH /{id}/read`, `PATCH /read-all`

### network (`/api/v1`, tag "Network") — tables: `connections`, `conversations`, `messages`
`GET /connections`, `POST /connections`, `PATCH /connections/{id}`, `DELETE /connections/{id}`, `GET /conversations`, `POST /conversations`, `GET /conversations/{id}/messages`, `POST /conversations/{id}/messages` — plus a WebSocket import present, suggesting a real-time messaging endpoint worth confirming before redesigning chat.

### social (`/api/v1/social`) — tables: `posts`, `post_likes`, `post_comments`
`GET /feed`, `GET /posts/public`, `POST /posts`, `GET /posts/{id}`, `PATCH /posts/{id}`, `DELETE /posts/{id}`, `POST /posts/{id}/like`, `GET /posts/{id}/comments`, `POST /posts/{id}/comments`, `DELETE /posts/{id}/comments/{comment_id}`

> **Gap vs. brief**: no shares/reposts (no model, field, or endpoint). No polls, events, or articles anywhere in the backend (confirmed zero grep hits for all three).

### groups (`/api/v1/groups`) — tables: `groups`, `group_memberships`, `group_posts`
13 endpoints: CRUD, join/leave, members + role management, group-scoped posts.

> **Gap**: `GroupPost` has no like/comment child tables — isolated from `social.Post`'s like/comment system. Two parallel, unconnected posting systems exist today.

### contracts (`/api/v1/contracts`) — tables: `contracts`, `contract_milestones`
`POST /`, `GET /me`, `GET /{id}`, `PATCH /{id}`, `POST /{id}/sign`, `POST /{id}/terminate`, `POST /{id}/milestones`

> **Reconciliation needed**: this is a *third* overlapping milestone concept alongside `projects.Milestone` and `projects.TaskAssignmentOffer`/`WorkLedgerEntry` — see Part C.

### trust (`/api/v1/trust`) — tables: `user_verifications`, `user_trust_scores`
`GET /scores/{user_id}`, `GET /reviews/{user_id}`, `POST /reviews`, `GET /verifications/{user_id}`, `POST /verifications`

### payments (`/api/v1/payments`) — **no models.py of its own**; reuses `projects.payment_transactions`
`GET /wallet`, `GET /transactions`, `POST /escrow`, `POST /{id}/release`, `POST /{id}/refund` — via `SandboxPaymentProvider` (confirmed **sandbox-only**, no real payment gateway integrated).

### quality (`/api/v1/quality`) — no models.py, stateless AI wrapper around `QualityEngineAgent`
`POST /evaluate`, `POST /review-code`, `POST /batch-evaluate`, `GET /dashboard`, `GET /health`

> **This is the endpoint BUG-03 (from the UI audit) confirmed reachable with zero auth on the frontend** — the backend endpoint itself requires `get_current_user`, meaning the *frontend page* is the gap, not the API. Fixing the frontend gate is a one-line-category fix, not a backend change.

### marketplace — **headless, no router**, tables: `skills`, `user_skills`, `job_skills`, `project_tasks`, `recommendations`, `ai_reports`
Consumed by `projects`, `payments`, `jobs`, `engineers`, `trust` — shared skill-taxonomy and AI-report storage.

---

## Part B — Frontend Page → API Calls → Tables (current state)

| Frontend Route | Calls (via hooks) | Backend Endpoint(s) | Table(s) |
|---|---|---|---|
| `/` | none (static) | — | — |
| `/jobs` | `useJobs`, `useSavedJobs` | `GET /jobs`, `GET /saved-jobs` | `job_posts`, `saved_jobs` |
| `/jobs/[id]` | `useJob`, apply action | `GET /jobs/{id}`, `POST /applications/jobs/{id}` | `job_posts`, `job_applications` |
| `/jobs/new` | job wizard submit | `POST /jobs` | `job_posts` |
| `/engineers` | directory search | `GET /engineers/search` | `engineer_profiles` |
| `/engineers/[id]` | profile fetch | `GET /engineers/{id}` | `engineer_profiles` |
| `/companies`, `/companies/[id]` | directory | `GET /companies/public`, `GET /companies/{id}` | `company_profiles` |
| `/quality` | evaluator/reviewer forms | `POST /quality/evaluate`, `POST /quality/review-code` | none (stateless AI) |
| `/auth/login`, `/auth/register` | `useAuth` | `POST /auth/login`, `POST /auth/register` | `users` |
| `/engineer/dashboard` | `useEngineerProfile`, `useJobs`, `useSavedJobs`, `useApplications`, `useRecommendations` | `GET /engineers/me`, `GET /jobs`, `GET /saved-jobs`, `GET /applications/me`, `GET /matching/recommendations` | `engineer_profiles`, `job_posts`, `saved_jobs`, `job_applications`, `job_matches` |
| `/engineer/profile` | `useEngineerProfile` | `GET/POST/PUT /engineers/me`, `POST /engineers/me/ai-enhance`, `POST /engineers/me/resume` | `engineer_profiles` |
| `/engineer/applications` | `useApplications`, `useTaskOffers` | `GET /applications/me`, `GET /projects/task-offers` | `job_applications`, `task_assignment_offers` |
| `/engineer/recommendations` | `useRecommendations`, `useUpdateMatchStatus` | `GET /matching/recommendations`, `PATCH /matching/{id}/status` | `job_matches` |
| `/engineer/workspace` | `useWorkerWorkspace` | `GET /projects/my-tasks`, `/my-offers`, submission endpoints | `task_assignment_offers`, `work_submissions`, `projects` |
| `/company/dashboard` | `useJobs`, `useProjects`, `useCompanyApplications` | `GET /jobs/company`, `GET /projects`, `GET /applications/company` | `job_posts`, `projects`, `job_applications` |
| `/company/profile` | company profile hook | `GET/POST/PUT /companies/me` | `company_profiles` |
| `/company/jobs` | `useCompanyJobs`, `useCompanyApplications` | `GET /jobs/company`, `GET /applications/company` | `job_posts`, `job_applications` |
| `/company/candidates` | `useFreelancers`, `useCandidateMatches` | `GET /engineers/search`, `GET /matching/candidates/{job_id}` | `engineer_profiles`, `job_matches` |
| `/admin/dashboard` | admin stats hooks | `GET /admin/dashboard`, `GET /admin/stats`, `GET /admin/health/details` | `activity_logs`, `api_sync_logs`, cross-domain reads |
| `/admin/users` | admin users hook | `GET /admin/users`, `PATCH /admin/users/{id}/status` | `users` |
| `/admin/jobs` | admin jobs hook | `GET /jobs`, `PATCH /admin/jobs/{id}/status` | `job_posts` |
| `/feed` | `useFeed`, `usePostComments` | `GET /social/feed`, `POST /social/posts`, `/like`, `/comments` | `posts`, `post_likes`, `post_comments` |
| `/network` | `useConnections`, `useFreelancers` | `GET/POST/PATCH/DELETE /connections` | `connections` |
| `/messages` | `useConversations`, `useMessages` | `GET/POST /conversations`, `GET/POST /conversations/{id}/messages` | `conversations`, `messages` |
| `/notifications` | `useNotifications` | `GET /notifications`, `/unread-count`, `PATCH /{id}/read` | `notifications` |
| `/groups` | `useGroups`, `useMyGroups`, `useGroupPosts` | `GET /groups`, `/me/joined`, `/{id}/posts` | `groups`, `group_memberships`, `group_posts` |
| `/projects`, `/projects/[id]` | `useProjects`, `useCreateProject`, project detail hooks | `GET/POST /projects`, `/{id}`, `/milestones`, `/tasks`, `/activity` | `projects`, `project_members`, `milestones`, `task_comments`, `task_dependencies`, `project_activity` |
| `/contracts`, `/contracts/[id]` | `useContracts` | `POST/GET/PATCH /contracts`, `/sign`, `/terminate` | `contracts`, `contract_milestones` |
| `/payments` | `useWallet`, `useTransactions`, `usePayments` | `GET /payments/wallet`, `/transactions`, `POST /payments/escrow` | `payment_transactions` (via `projects` domain) |
| `/settings` | `useAuth` per-tab | `GET /auth/me` (no dedicated settings endpoints — password change/session mgmt admittedly unbuilt) | `users` |

---

## Part C — Reconciliation Issues to Resolve Before/During Redesign

1. **Three overlapping milestone concepts**: `projects.Milestone`, `projects.TaskAssignmentOffer`/`WorkLedgerEntry`, `contracts.ContractMilestone`. The redesign's "Freelance Marketplace" and "Project Workspace" screens need one unified milestone model, not three.
2. **Two escrow paths**: `/payments/escrow` and `/projects/{id}/payments/escrow`, both ultimately writing `projects.payment_transactions` via `SandboxPaymentProvider`. Consolidate to one.
3. **Two unconnected posting systems**: `social.Post` (likes+comments) and `groups.GroupPost` (no likes/comments at all). The brief's unified feed needs these merged or `GroupPost` needs like/comment tables added.
4. **Escrow/payments are sandbox-only** — no real payment gateway is integrated anywhere. Treat "Wallet" screens as demo-data-backed until a real provider (Stripe Connect, per the brief's own Stripe inspiration) is actually integrated — that is real backend work, not a frontend redesign task.
5. **Job aggregation is 5 sources, not 10+.** Adding Greenhouse/Lever/Ashby/Workday/Adzuna/Jobicy/Bundesagentur integrations is genuinely new backend work (new aggregator adapter classes following the existing `BaseAggregator` pattern) — significant scope, not a config change.

## Part D — What This Means for "Do Not Break the Backend"
Because `projects`/`contracts`/`payments`/`marketplace` already implement most of the freelance-marketplace domain (just fragmented), the redesign's frontend work for that surface is mostly **exposing and consolidating existing endpoints under a cleaner IA**, not waiting on new backend build-out — this significantly de-risks the "Freelance Marketplace" and "AI Work OS" phases of the brief relative to a from-scratch estimate. The genuinely new backend work required is: (a) unifying the 3 milestone concepts, (b) shares/reposts + events/articles/polls for social, (c) any new ATS/job-board adapters, (d) a real payment gateway to replace the sandbox provider, (e) exposing `PATCH /auth/role` in the frontend as part of the workspace-switcher redesign.
