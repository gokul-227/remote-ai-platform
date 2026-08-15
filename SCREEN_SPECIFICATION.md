# Screen Specification — Remote AI Platform Redesign

Cross-references the brief's requested screen list against the 38 route templates confirmed to exist today (`docs/ui-audit/ROUTE-INVENTORY.md`) and the backend capability confirmed in `API_MAPPING.md`. Status legend: **EXISTS** (build on it) / **PARTIAL** (exists but needs real rework, not just restyling) / **NET-NEW** (no current page; backend may or may not support it, noted per row).

---

## Authentication
| Screen | Status | Notes |
|---|---|---|
| Splash | NET-NEW | No splash/loading screen exists; low effort |
| Welcome | NET-NEW | `/` (landing) partially serves this today for logged-out users |
| Sign up | EXISTS | `/auth/register` — working 2-step wizard, backend `POST /auth/register` |
| Sign in | EXISTS | `/auth/login` — working, tested (valid + invalid credentials both confirmed) |
| Forgot password | PARTIAL | `/auth/forgot-password` exists as an **honest stub** — no backend reset endpoint exists at all. Building the real screen requires new backend work (email + reset-token flow), not just UI. |
| Email verification | NET-NEW | No backend support found — confirm with backend owner before designing, this is new backend scope |
| Onboarding | NET-NEW | Today, "onboarding" = landing directly on the empty profile-edit page. A real guided multi-step onboarding is genuinely new frontend work (backend fields already exist to populate) |
| AI profile import | PARTIAL | `POST /engineers/me/resume` + `POST /engineers/me/ai-enhance` already do resume-upload + AI enhancement — the backend capability exists; a dedicated "AI profile import" onboarding *screen* wrapping these calls is net-new frontend work |

## Personal Workspace
| Screen | Status | Notes |
|---|---|---|
| Home feed | EXISTS | `/feed` — backend `social` domain real (posts/likes/comments) |
| Profile | EXISTS | `/engineer/profile` — needs to become persona-agnostic under the new "one identity" model |
| Network | EXISTS | `/network` — backend `network` domain real (connections) |
| Groups | EXISTS | `/groups` — backend real but isolated from feed posts (see API_MAPPING Part C) |
| Jobs | EXISTS | `/jobs` — fully working, real aggregated data confirmed in prior audit |
| Job detail | EXISTS | `/jobs/[id]` |
| Applications | EXISTS | `/engineer/applications` |
| Projects | PARTIAL | `/projects` exists; needs redesign to surface the freelance-marketplace depth already in the backend (task offers, milestones, escrow) which today's UI doesn't expose |
| Project detail | PARTIAL | `/projects/[id]` — same note; backend has 36 project endpoints, current UI likely surfaces a fraction |
| Proposals | NET-NEW (frontend) | Backend equivalent exists as `task_assignment_offers` / `POST /projects/tasks/{id}/offers` — no dedicated "Proposals" screen exists today, needs building against real existing endpoints |
| Messages | EXISTS | `/messages` — backend `network` domain includes conversations/messages + a WebSocket import worth confirming for real-time |
| Calendar | NET-NEW | No backend model found for calendar/scheduling/interviews anywhere — this is new backend scope, not just a missing screen |
| Wallet | PARTIAL | `/payments` exists (confirmed orphaned from nav in prior audit) — backend wallet/transactions/escrow real but **sandbox-only**, no live payment gateway |
| Settings | PARTIAL | `/settings` exists; Security tab admittedly incomplete (no password change/session mgmt backend) |

## Organization Workspace
| Screen | Status | Notes |
|---|---|---|
| Dashboard | EXISTS | `/company/dashboard` |
| Company profile | EXISTS | `/company/profile` |
| Post job | EXISTS | `/jobs/new` — working 5-step wizard, tested end to end |
| Edit job | PARTIAL | `PATCH /jobs/{id}` exists on backend; confirm a dedicated edit UI exists vs. reusing the creation wizard |
| Candidates | EXISTS | `/company/candidates` |
| Candidate profile | EXISTS | reuses `/engineers/[id]` public profile |
| Hiring pipeline | NET-NEW (frontend) | Backend has application status transitions (`PATCH /applications/{id}/status`) but no dedicated pipeline/kanban UI exists |
| Interviews | NET-NEW | No backend model for interview scheduling found anywhere — new backend scope |
| Projects | EXISTS (shared with Personal Workspace) | Same `/projects` surface, company-side view |
| Team | NET-NEW | No backend model for org-internal team membership/roles beyond the single-user model found — new backend scope if "team" means multiple human members per organization account |
| Payments | PARTIAL | Same `/payments` backend, org-scoped view needed |
| Analytics | NET-NEW (frontend) | `GET /admin/stats`-equivalent doesn't exist scoped to a single company; would need a new company-scoped stats endpoint |
| Settings | EXISTS (shared pattern with Personal Workspace) | |

## Project Workspace
| Screen | Status | Notes |
|---|---|---|
| Overview | PARTIAL | `/projects/[id]` exists; needs restructuring into named sub-tabs below |
| Tasks | PARTIAL | Backend has full task CRUD + dependencies + comments; current UI depth unconfirmed without a fresh code read at implementation time |
| Messages | NET-NEW (frontend) | No project-scoped messaging UI confirmed; could reuse `network` conversations scoped to a project, needs a design decision |
| Files | NET-NEW | No file-attachment model found under `projects` domain — new backend scope (though `app/core/storage.py`'s S3/MinIO/Supabase Storage layer already exists generically and could back this) |
| Meetings | NET-NEW | No backend model found — new backend scope; brief's "meeting summaries" AI feature has nowhere to attach to yet |
| Timeline | PARTIAL | Backend `project_activity` table + milestones exist; a timeline/Gantt UI is net-new frontend work against real data |
| Payments | PARTIAL | Same wallet/escrow backend, project-scoped |
| AI | PARTIAL | Backend already has `POST /projects/{id}/plan`, `/ai-report`, `/ai/progress-summary`, `/ai/risk-analysis`, `/ai/documentation` — **this is the single biggest "already built, just not surfaced" opportunity in the whole redesign.** A project-AI-tab UI wrapping these 5 existing endpoints could ship fast. |

## Admin (separate application, per the brief)
| Screen | Status | Notes |
|---|---|---|
| Login | NET-NEW (separate app) | Currently admin shares the main app's login + role check; brief wants a genuinely separate application/URL — real architectural decision (see IMPLEMENTATION_PLAN.md Phase 12) |
| Dashboard | EXISTS | `/admin/dashboard` — backend `GET /admin/dashboard`, `/admin/stats` real |
| Users | EXISTS | `/admin/users` |
| Organizations | NET-NEW | No dedicated companies list/detail admin screen exists (confirmed in prior UI audit's FINAL-AUDIT.md "Missing Pages") |
| Jobs | EXISTS | `/admin/jobs` |
| Projects | NET-NEW | No admin-side project oversight screen exists |
| Moderation | PARTIAL | Backend `moderation` router + `moderation_reports` table exist; no frontend screen found for it |
| Payments | NET-NEW | No admin-side payments oversight screen exists |
| Analytics | PARTIAL | `GET /admin/stats`, `/admin/ai-usage` exist; no dedicated analytics screen beyond the basic dashboard counters |
| Audit logs | PARTIAL | `GET /admin/activity-logs` exists on backend; no dedicated audit-log screen confirmed |
| Feature flags | NET-NEW | No backend model for feature flags found anywhere — new backend scope entirely |
| System health | PARTIAL — **known broken** | `GET /admin/health/details` exists but hardcodes Redis/MinIO/Keycloak status regardless of reality (confirmed bug, prior audit) — fixing this is prerequisite to trusting this screen |

---

## Summary Counts
- **EXISTS (build on it as-is)**: 17 screens
- **PARTIAL (real rework, mostly frontend against existing backend capability)**: 17 screens
- **NET-NEW requiring genuinely new backend work** (calendar, interviews, team/multi-member orgs, files, meetings, feature flags, email verification, hiring pipeline, org-scoped analytics): 9 screens — these should be called out explicitly in any timeline estimate, since they are not restyling work.
- **NET-NEW, frontend-only** (proposals screen, project-AI tab, separate admin app shell): 3 screens — these are high-leverage because the backend already supports them.

The single highest-leverage NET-NEW-but-frontend-only opportunity: **the Project Workspace "AI" tab**, since all 5 backing endpoints already exist and work.
