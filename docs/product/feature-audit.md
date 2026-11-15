# Feature visibility audit (November 2026)

Walked as a new member (no profile, no organisation), as the same member after setting up an
organisation page, and as staff, on desktop (1366×900) and phone (390×844), against the isolated e2e
stack with mock auth. The crawl helper is `tests/e2e/tests/zz-audit-crawl.spec.ts` (runs only with
`AUDIT_OUT` set); the journeys that now guard the fixes are in `tests/e2e/tests/feature-visibility.spec.ts`.

Legend: **Nav** = reachable from navigation (D desktop / P phone) · **Loads** = renders without errors
· **Empty** = helpful empty state with a first action · **E2E** = happy path covered by a Playwright journey.

## Member app

| Feature | Before | After | Notes |
| --- | --- | --- | --- |
| Home after sign-in | Landed on the feed; no overview, no onboarding | New `#home` overview: getting-started checklist, jobs for you, messages, network, projects, files, meetings, assistant, directory of every area | Home tab, logo and sign-in all land here |
| Feed + "From around the web" | Nav D/P ✓, loads ✓ | unchanged, plus "Feed" in Home section | 404 on `/matching/recommendations` for members without a profile is expected and handled |
| Notifications | Top bar only | Also in Home section nav | |
| Notification preferences + push | Hidden inside Settings tab | Own entry "Notification settings" (`#notifysettings`) under Account | E2E ✓ |
| AI assistant | Floating dock only | Also in Home section, home card, checklist | |
| Network / connections / invitations | ✓ | ✓; nested `<main>` replaced by `<section>` | |
| People you may know | Route existed, not in nav | In Network → My network | |
| Jobs + filters + saved searches | ✓ | ✓ | covered by `job-filters.spec.ts` |
| Applications | ✓ | ✓ | `journeys.spec.ts` |
| Hiring tools | Hiring dashboard (`#codash`) not in nav | "Hiring dashboard" under Jobs → Hiring | `/jobs/company` and `/applications/company` 404 for members without an organisation; screens handle it |
| Freelancing contracts / milestones / engagements | ✓ | ✓ | "Deliverables" and "Reviews & ratings" open tabs of Proposals & offers (same page heading) |
| Messaging | ✓ | ✓ + home card | `journeys.spec.ts` |
| Channels (threads, attachments, reactions, search) | ✓ | ✓ | create + post now in E2E |
| Communities / groups | ✓; group cover button had no accessible name (axe failure once groups exist) | Fixed (`aria-label`) | create in E2E |
| Meetings / calls / waiting room | ✓ | ✓ + home card | scheduling needs a connection (explained on page) |
| Projects / boards / tasks | **Broken**: "Create project" did nothing without a description, then failed with "Company profile required" and left the member stuck | Description optional; members without an organisation get "Set up organisation page" with a link | E2E covers both paths |
| Files (folders, sharing, Office previews) | ✓ | ✓ + home card | `files.spec.ts` |
| Docs / Sheets / Slides | ✓ | ✓ | `platform.spec.ts` |
| GitHub integration | ✓ (Repositories, Connected apps) | ✓ | |
| In-app browser | ✓ | ✓ | |
| Settings / privacy / data export / delete | ✓ | ✓ | `privacy.spec.ts` |
| Organisation roles | ✓ (company page) | ✓ | |

Known noise left in place: for a member without a profile or organisation, several screens request
`/engineers/me`, `/companies/me`, `/jobs/company`, `/applications/company` and get 404s that the UI
handles as empty states (changing them to 200 would alter tested API contracts). The Earnings page
still shows an "In escrow for you" figure; payments are out of scope for this change.

## Staff console

Every module listed in the console navigation (users, staff roles, companies, verifications, moderation
reports and decisions, restricted accounts, job listings, job sources, background processing, contracts,
support tickets, AI usage, assistant activity, feature flags, announcements, status, incidents,
operations inventory, service catalogue, backups, usage, audit and security events) is reachable and
loads; `feature-visibility.spec.ts` opens each one as staff.

Still open: at a 820px (tablet) width the console scrolls horizontally by 84px on the sign-in screen,
Staff & roles and Feature flags (`responsive.spec.ts` staff console test). This change does not touch the
console. The console must be built with `NEXT_PUBLIC_DEPLOY_ENV` matching the API environment, or every
write control is disabled.

## Feature flags

No flag changed. The two flags that are off by default are off for readiness reasons, not oversight:
`realtime_websockets` (the web app polls; sockets need short-lived connection tickets first) and
`contacts_import` (waiting for Google OAuth verification). Payments (`MARKETPLACE_PAYMENTS_ENABLED`) stay off.
