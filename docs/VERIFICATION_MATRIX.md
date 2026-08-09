# Verification Matrix

Date: 2026-08-09 (evidence from the fresh-clone Docker run and live E2E suites)

Legend: VERIFIED = exercised against the running local stack; IMPLEMENTED = code present, not live-exercised; SANDBOX = intentional non-production behavior; NOT_IMPLEMENTED = absent.

| # | Domain / feature | Backend | Migration | Tests | Live E2E | Status |
|---|---|---|---|---|---|---|
| 1 | Auth register/login/me | rout + service | 001,004 | test_auth | platform E2E | VERIFIED |
| 2 | RBAC engineer/company/admin | require_role | 002 | test_auth, security | platform E2E | VERIFIED |
| 3 | Engineer profile | domain | 003 | test_profiles | platform E2E | VERIFIED |
| 4 | Company profile | domain | 003 | test_profiles | platform E2E | VERIFIED |
| 5 | Jobs create/publish/unpublish/search/filter | domain | 007 | test_jobs | platform E2E | VERIFIED |
| 6 | Jobs company_id filter/search | router + service | 007 | test_jobs | live API check | VERIFIED |
| 7 | Saved jobs | domain | 007 | test_jobs | platform E2E | VERIFIED |
| 8 | Applications | domain | 007 | test_applications | platform E2E | VERIFIED |
| 9 | Matching/recommendations | domain | 005 | test_matching | unit | IMPLEMENTED |
| 10 | Job aggregation adapters | agents | 018 | test_marketplace | graceful fallback | IMPLEMENTED |
| 11 | Network connections | domain | 008 | test_network_layer | unit | IMPLEMENTED |
| 12 | Messaging REST | domain | 008 | test_network_layer | platform + WS | VERIFIED |
| 13 | Messaging WebSocket | core WS manager | 008 | live WS script | WS E2E | VERIFIED |
| 14 | Social posts/likes/comments/feed | domain | 019 | test_social_feed | platform E2E | VERIFIED |
| 15 | Groups + roles + posts | domain | 022 | test_groups | unit | IMPLEMENTED |
| 16 | Notifications | domain | 006 | test_network_layer | platform E2E | VERIFIED |
| 17 | Projects | domain | 009 | test_project_management | task dispatch E2E | VERIFIED |
| 18 | Task offers/accept/reject | domain | 011 | test_project_management | task dispatch E2E | VERIFIED |
| 19 | Work submissions/revisions/review | domain | 012 | live dispatch script | task dispatch E2E | VERIFIED |
| 20 | Work ledger | domain | 013 | unit | live API | VERIFIED |
| 21 | Contracts | domain | 020 | test_contracts | unit | IMPLEMENTED |
| 22 | Trust/reputation | domain | 015,021 | test_trust_reputation | unit | IMPLEMENTED |
| 23 | Payments sandbox escrow/ledger | domain | 013,014 | test_payments | task dispatch E2E | VERIFIED |
| 24 | Payments real provider (Stripe etc.) | absent | - | - | - | NOT_IMPLEMENTED |
| 25 | AI quality engine | agents | 017 | test_quality_engine | unit + fallback | IMPLEMENTED |
| 26 | AI usage logs | domain | 017 | test_ai_platform | unit | IMPLEMENTED |
| 27 | Admin dashboard/users/logs/health | domain | 002 | test_admin_console | platform E2E | VERIFIED |
| 28 | Moderation reports | domain | 016 | unit | - | IMPLEMENTED |
| 29 | Health/observability | core | - | test_health | live API | VERIFIED |
| 30 | Celery worker/beat | workers | - | - | containers healthy | VERIFIED |

## Summary

| Class | Count |
|---|---|
| VERIFIED (live E2E or live API) | 18 |
| IMPLEMENTED (unit-covered, not live-exercised in this pass) | 8 |
| SANDBOX | 1 (payments escrow/ledger) |
| NOT_IMPLEMENTED | 1 (real payment provider) |