# Test Matrix — UI/UX Audit

Environment: local docker-compose stack (frontend `localhost:3000`, backend `localhost:8000`, Postgres/Redis/Keycloak/MinIO/Celery all `running`, `/api/v1/health` reporting `database: ok`, `queues: ok`). Demo accounts used: `admin@workmesh.ai` / `engineer@workmesh.ai` / `company@workmesh.ai` (seeded, publicly documented demo credentials).

## Coverage by Role × Page

| Page | Logged out | Engineer | Company | Admin | Notes |
|---|---|---|---|---|---|
| `/` | ✅ tested (3 viewports) | — | — | — | |
| `/jobs` | ✅ tested (2 viewports) | ✅ tested | — | — | |
| `/jobs/[id]` | ✅ tested | ✅ tested | — | — | |
| `/engineers` | ✅ tested (2 viewports) | — | — | — | |
| `/engineers/[id]` | ✅ tested | — | — | — | |
| `/companies` | ✅ tested (2 viewports) | — | — | — | |
| `/freelancers` | ✅ tested (redirect confirmed) | — | — | — | |
| `/quality` | ✅ tested — **confirmed unguarded** | ✅ tested | — | — | see BUG-03 |
| `404` route | ✅ tested | — | — | — | |
| `/auth/login` | ✅ tested (empty, invalid creds) | — | — | — | |
| `/auth/register` | ✅ tested (step 1, step 2) | — | — | — | |
| `/auth/forgot-password` | ✅ tested | — | — | — | |
| `/feed` | ✅ redirect confirmed | ✅ tested | — | — | |
| `/network` | ✅ redirect confirmed | ✅ tested (JS error found) | — | — | |
| `/messages` | ✅ redirect confirmed | ✅ tested | — | — | |
| `/notifications` | ✅ redirect confirmed | ✅ tested | ✅ tested | — | |
| `/groups` | ✅ redirect confirmed | ✅ tested | — | — | |
| `/projects` | ✅ redirect confirmed | ✅ tested | ✅ tested | — | |
| `/contracts` | ✅ redirect confirmed | ✅ tested | ✅ tested | — | |
| `/settings` | ✅ redirect confirmed | ✅ tested | ✅ tested | — | |
| `/payments` | ✅ redirect confirmed | ✅ tested | — | — | |
| `/workspace` (alias) | ✅ redirect confirmed | ✅ tested | — | — | |
| `/engineer/dashboard` | ✅ redirect confirmed | ✅ tested (3 viewports) | ✅ **cross-role tested — BROKEN, see BUG-02** | ✅ **cross-role tested — BROKEN, see BUG-02** | |
| `/engineer/profile` | — | ✅ tested | — | — | |
| `/engineer/recommendations` | — | ✅ tested | — | — | |
| `/engineer/applications` | — | ✅ tested | — | — | |
| `/engineer/workspace` | — | ✅ tested | — | — | |
| `/company/dashboard` | ✅ redirect confirmed | ✅ cross-role tested (redirected correctly) | ✅ tested (3 viewports) | ✅ cross-role tested (loads, correct — ADMIN is an allowed role) | |
| `/company/profile` | — | — | ✅ tested | — | |
| `/company/jobs` | — | — | ✅ tested | — | |
| `/company/candidates` | — | — | ✅ tested | — | |
| `/jobs/new` (5-step wizard) | — | — | ✅ all 5 steps tested | — | |
| `/admin/dashboard` | ✅ redirect confirmed | ✅ cross-role tested (redirected correctly) | ✅ cross-role tested (redirected correctly) | ✅ tested (3 viewports) | |
| `/admin/users` | — | — | — | ✅ tested | |
| `/admin/jobs` | — | — | — | ✅ tested | |

## Auth Flow Testing

| Scenario | Tested | Result |
|---|---|---|
| Landing page logged out | ✅ | Renders correctly, correct CTAs (Sign In / Join Now) |
| Login empty form | ✅ | Renders cleanly, no premature validation errors |
| Login invalid credentials | ✅ | Correct inline "Invalid credentials" error, red banner, form retains entered email |
| Register step 1 → step 2 (role select) | ✅ | 2-step wizard confirmed working, role cards render correctly |
| Login success (all 3 roles) | ✅ | All 3 demo accounts log in and land on their correct role dashboard |
| Direct URL access to protected route while logged out | ✅ (14 routes tested) | All correctly redirect to `/auth/login` |
| Cross-role access (wrong role hitting a role-gated page) | ✅ (6 combinations tested) | 4/6 correctly redirect; **2/6 broken — see BUG-02** (`/engineer/dashboard` accessible by COMPANY and ADMIN) |
| Browser back/forward after login | Not separately captured this pass | — |
| Session-expired behavior | Not tested this pass (requires token manipulation) | — |
| OAuth/social login | N/A | Not implemented in this application |

## Responsive Coverage

Captured at all 3 required viewports (1440×1000 desktop / 1024×1000 tablet / 390×844 mobile) for: `/` (home), `/jobs`, `/engineers`, `/companies`, `/engineer/dashboard`, `/company/dashboard`, `/admin/dashboard`. All other pages captured at desktop only, per the audit's "capture desktop for every page, all 3 viewports for important responsive pages" instruction.
