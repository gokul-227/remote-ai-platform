# Navigation Map — UI/UX Audit

Confirmed by reading the top navbar / sidebar / mobile bottom-nav components and by visually inspecting logged-out and per-role screenshots.

## Logged-out (public) top nav
`Jobs` · `Engineers` · `Companies` · search bar (⌘K) · `Sign In` · `Join Now`

## Logged-in top nav (common to all roles)
Logo/Home · search bar (⌘K) · role-specific center items (see below) · notification bell · profile dropdown (Profile / Settings / role-specific console link / Logout)

### Role-specific center nav items
| Role | Center nav items |
|---|---|
| ENGINEER | Home, Feed, Jobs, Engineers, Contracts, Communities, **For You** (recommendations), Network, Projects, Messages |
| COMPANY | Home, Feed, **My Jobs**, **Candidates**, Contracts, Communities, Network, Projects, Messages |
| ADMIN | Home, Feed, Jobs, Engineers, Contracts, Communities, Network, Projects, Messages (no distinct admin-only top-nav item beyond the profile-dropdown "Admin Console" link) |

## Sidebar (role-specific, left rail on dashboard/workspace pages)
| Role | Sidebar items |
|---|---|
| ENGINEER | My Profile, Career Dashboard, Recommendations, Saved Jobs, My Applications, Execution Workspace, AI Quality Engine |
| COMPANY | Company Profile, Hiring Dashboard, My Job Postings, Candidate Discovery |
| ADMIN | Admin Console, User Management, Job Listings |

## Mobile bottom nav (390px, confirmed via screenshots)
`Home` · `Feed` · role-specific 3rd item (`Jobs` for ENGINEER/ADMIN, `Jobs`/`Network` layout observed for COMPANY) · `Network` · `Messages`

**Confirmed defect**: on both ENGINEER and COMPANY dashboards at mobile width, a fixed dev-error badge overlaps this bar (see BUGS.md BUG-01).

## Confirmed Working Navigation Paths
- Logged-out `Sign In` → `/auth/login` ✅
- Logged-out `Join Now` → `/auth/register` → step 2 role select ✅
- Login page `Forgot password?` → `/auth/forgot-password` ✅ (stub page, no 404 — regression-fixed in a prior session)
- Any protected route hit directly while logged out → redirects to `/auth/login` ✅ (confirmed on 14 distinct routes)
- Post-login redirect lands on the correct role dashboard for all 3 demo accounts ✅
- Company `/jobs/new` "Post a job" 5-step wizard: Role basics → Description → Requirements → Compensation → Review, all "Next" transitions confirmed working ✅

## Confirmed Broken/Gap Navigation Paths
- `RequireAuth`-only guard on `/engineer/dashboard` means COMPANY/ADMIN nav (typing the URL, or a stale bookmark) does **not** redirect away — lands on a broken page (BUG-02).
- `/quality` has no nav-independent guard — reachable directly by URL with no session at all, bypassing the entire auth boundary (BUG-03).
- `/payments` exists and is fully built but has **no navigation entry anywhere** (not in top nav, sidebar, or mobile nav) — it's orphaned, reachable only by typing the URL directly. Not necessarily a "bug," but worth flagging: either it's an intentionally hidden/future feature, or a missed nav wire-up.

## Dead/Legacy Routes (redirect-only, not surfaced in nav)
- `/freelancers` → `/engineers`
- `/workspace` → `/engineer/workspace`

Both exist purely as redirect targets, presumably for backward-compat with old links; neither appears in any current nav component.
