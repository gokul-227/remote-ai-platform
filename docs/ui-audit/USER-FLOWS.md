# User Flow Map — UI/UX Audit

Each transition marked WORKS / BROKEN / MISSING / UNCLEAR based on actual browser testing this session, not code inspection alone.

## ENGINEER Flow
```
Landing (/)                                    WORKS
  → Sign up (/auth/register, 2-step wizard)    WORKS
  → Role: "I am an Engineer"                   WORKS
  → Onboarding                                 MISSING — no dedicated onboarding route; user lands
                                                directly on /engineer/profile in "create your profile" state
  → Profile (/engineer/profile)                WORKS
  → Dashboard (/engineer/dashboard)            WORKS — real AI match score (93/100), factor breakdown,
                                                job recommendations all render with live data
  → Search jobs (/jobs)                        WORKS — real aggregated job data, filters render
  → Job details (/jobs/[id])                   WORKS
  → Save/apply                                 UNCLEAR — not exercised end-to-end this pass (button
                                                presence confirmed, submission flow not clicked through)
  → Applications (/engineer/applications)       WORKS (empty state correctly shown for fresh demo account)
  → Recommendations (/engineer/recommendations) WORKS
  → AI match (embedded in dashboard/job detail) WORKS — genuinely explainable, 6-factor breakdown
  → Workspace (/engineer/workspace)            WORKS
  → Contracts (/contracts)                     WORKS (self-gated page, see BUG-04)
  → Notifications (/notifications)             WORKS
  → Settings (/settings)                       WORKS — Security tab honestly states password
                                                change/session mgmt not available yet
  → Logout                                     Not re-tested this pass (verified working in prior session)
```

## COMPANY Flow
```
Landing (/)                                    WORKS
  → Sign up                                     WORKS
  → Role: "I am hiring / represent a company"   WORKS
  → Company onboarding                          MISSING — no dedicated onboarding; lands directly on
                                                 /company/profile in "create your profile" state
  → Company profile (/company/profile)          WORKS
  → Dashboard (/company/dashboard)              WORKS — real stats (20 active positions, 4 candidates
                                                 in directory), zero console errors
  → Create job (/jobs/new)                      WORKS — full 5-step wizard confirmed: Role basics →
                                                 Description → Requirements → Compensation → Review
  → Publish                                     UNCLEAR — not submitted to completion this pass (prior
                                                 session confirmed this works via E2E test suite)
  → Candidates (/company/candidates)            WORKS — real engineer profiles with skills shown
  → Candidate profile                           UNCLEAR — "View profile" links present, not clicked
                                                 through this pass
  → AI match (candidate discovery)              WORKS (visible in candidates list context)
  → Application (viewing applicants)            WORKS (`/company/jobs` shows postings)
  → Contract                                    WORKS (`/contracts` renders)
  → Workspace/Projects (/projects)              WORKS
  → Notifications                               WORKS
  → Settings                                    WORKS
  → Logout                                      Not re-tested this pass
```

## ADMIN Flow
```
Login                                          WORKS
  → Dashboard (/admin/dashboard)                WORKS — real platform stats visible
  → Users (/admin/users)                        WORKS
  → Jobs (/admin/jobs)                          WORKS
  → Companies                                   MISSING — no dedicated /admin/companies route exists;
                                                 not in ROUTE-INVENTORY.md, not in admin sidebar
  → Applications                                MISSING — no dedicated /admin/applications route exists
  → Health (embedded in /admin/dashboard)        UNCLEAR / MISLEADING — "System Subsystem Health" panel
                                                 exists but Redis/MinIO/Keycloak rows are hardcoded
                                                 "OPERATIONAL" regardless of real status (confirmed in
                                                 a prior session's investigation — the panel cannot
                                                 detect a real Redis outage)
  → Analytics                                   MISSING — no dedicated analytics/stats page beyond the
                                                 dashboard's basic counters
  → Administration/moderation tools             UNCLEAR — a `moderation` router exists on the backend
                                                 but no corresponding frontend page was found in the
                                                 route inventory
```

## Cross-Cutting Observations
- Neither ENGINEER nor COMPANY has a distinct "onboarding" step separate from the profile-edit page itself — the profile page doubles as onboarding by showing a "create your profile" empty state on first login. This works but means there's no guided multi-step onboarding wizard (beyond the auth registration wizard itself).
- The admin flow is the thinnest of the three: dashboard + users + jobs only, with no companies/applications/analytics/moderation frontend pages, despite backend routers existing for some of these domains (`moderation`, `trust`).
