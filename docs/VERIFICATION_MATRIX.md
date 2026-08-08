# WorkMesh AI — Verification Matrix (Forensic Round 2)

**Audit commit:** `da4534e98b282ab9f734d1daf60b2f040ee59513` (branch `main`)
**Audit date:** 2026-08-08 | **Evidence basis:** runtime commands + static code inspection; no source modified.

## Classification Legend

| Class | Meaning |
|---|---|
| VERIFIED_WORKING | Executed successfully against the running system with real output |
| IMPLEMENTED_NOT_RUNTIME_VERIFIED | Code/model/migration/endpoint/UI all exist; runtime blocked by P0/pending migration |
| PARTIALLY_IMPLEMENTED | Some parts exist, required parts missing |
| BROKEN | Present but demonstrably failing |
| MOCK_OR_SANDBOX | Simulation/abstraction only; not production capability |
| NOT_IMPLEMENTED | No evidence of implementation |

## Global Runtime Blocker

**API container crash-loops** — `ImportError: cannot import name 'get_current_user' from 'app.core.security'` at `apps/api/app/domains/groups/router.py:16` (function lives in `app.domains.auth.dependencies`). Consequences: `/docs`, `/api/v1/*`, pytest, API-based frontend data — **all unreachable**.
**Migration drift** — repo head `022_groups`, live DB `009_project_management` (13 behind, 18 tables missing).

---

## Feature Matrix

| # | Feature | Backend | Model | Migration | Live DB | API | Frontend calls API | Tests | Runtime | Classification |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Register | ✔ | ✔ users | ✔001 | ✔ | ✔ /auth/register | ✔ | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 2 | Login / JWT / refresh / logout | ✔ | ✔ | ✔001,004 | ✔ | ✔ | ✔ | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 3 | Password hashing | ✔ bcrypt-style | — | ✔004 | ✔ | — | — | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 4 | RBAC (ENGINEER/COMPANY/ADMIN) | ✔ require_role | — | — | — | ✔ all routers | ✔ RequireRole.tsx | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 5 | Keycloak | realm+compose only | — | — | — | ✖ not wired to auth | ✖ | ✖ | ✖ | PARTIALLY_IMPLEMENTED |
| 6 | Engineer profile (bio/headline/location) | ✔ | ✔003 | ✔003 | ✔ | ✔ | ✔ | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 7 | Skills / experience / education / portfolio / certifications | ✔ | ✔003 | ✔003 | ✔ | ✔ | ✔ | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 8 | Availability / hourly rate | ✔ | ✔003 | ✔003 | ✔ | ✔ | ✔ | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 9 | Resume upload (MinIO) + parse + AI extraction | ✔ | ✔005 | ✔005 | ✔ | ✔ | ✔ | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 10 | Engineer dashboard / workspace | ✔ | ✔006,009–012 | ✔ | partial (009 only) | ✔ | ✔ | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 11 | Company profile + verification | ✔ | ✔002 | ✔002 | ✔ | ✔ | ✔ | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 12 | Company dashboard | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 13 | Job create/edit/publish/unpublish | ✔ | ✔001 | ✔001 | ✔ | ✔ | ✔ | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 14 | Job aggregation adapters (arbeitnow, remoteok, remotive, themuse, usajobs) | ✔ | ✔ | ✔ | ✔ | ✔ /jobs/sync | ✔ | ✔ | ✖ network unverified | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 15 | Job normalization / dedup | ✔ service | — | — | — | — | — | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 16 | Job search / filters | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 17 | Saved jobs | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 18 | Applications + lifecycle (apply/withdraw/status/invite) | ✔ | ✔001 | ✔001 | ✔ | ✔ | ✔ | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 19 | AI matching / scoring / missing-skills / ranking / reasoning / persistence | ✔ | ✔ | ✔ | ✔ job_matches | ✔ | ✔ recommendations | ✔ | ✖ AI provider absent | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 20 | Recommendations UI | ✔ | — | — | — | ✔ /matching/recommendations | ✔ useRecommendations | — | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 21 | Network connections (req/accept/reject/cancel/search/privacy) | ✔ | ✔008 | ✔008 | ✔ | ✔ | ✔ | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 22 | Conversations + REST messages + persistence | ✔ | ✔008 | ✔008 | ✔ | ✔ | ✔ | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 23 | WebSocket messaging + token auth + 4401 + membership check | ✔ | — | — | — | ✔ ws | ✔ useMessages | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 24 | Social posts / likes / comments / feed | ✔ router+service | ✔019 | ✔019 | ✖ | ✔ routes | ✔ useFeed | ✔ | ✖ blocked+migration | IMPLEMENTED_NEEDS_MIGRATION |
| 25 | Groups (create/search/categories/membership/roles/join/leave/posts) | ✔ | ✔022 | ✔022 | ✖ | ✖ import crash | ✔ useGroups | ✔ | ✖ blocked | BROKEN (P0 import) |
| 26 | Projects (create/brief/plan/milestones/tasks/deps/assignment) | ✔ | ✔009–011 | ✔009–011 | ✔ | ✔ | ✔ | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 27 | Task offers (offer/accept/decline/cancel/reassign) | ✔ | ✔011 | ✔011 | ✖ | ✔ | ✔ | ✔ | ✖ blocked+migration | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 28 | Submissions/revisions/review/approval/complete | ✔ | ✔012 | ✔012 | ✖ | ✔ | ✔ | ✔ | ✖ blocked+migration | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 29 | Work ledger | ✔ | ✔013 | ✔013 | ✖ | ✔ | ✔ | ✔ | ✖ blocked+migration | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 30 | Contracts (create/milestones/sign/terminate) | ✔ | ✔020 | ✔020 | ✖ | ✔ | ✔ | ✔ | ✖ blocked+migration | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 31 | Trust score / verifications / reviews / ratings | ✔ | ✔015,021 | ✔015,021 | ✖ | ✔ | ✔ | ✔ | ✖ blocked+migration | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 32 | Payments — sandbox escrow + ledger abstraction | ✔ sandbox | ✔013,014 | ✔013,014 | ✖ | ✔ | ✔ | ✔ | ✖ blocked+migration | MOCK_OR_SANDBOX |
| 33 | Payments — real provider (Stripe etc.) | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | NOT_IMPLEMENTED |
| 34 | AI quality engine (eval/code-review/LLM/fallback/persistence) | ✔ | ✔017 | ✔017 | ✖ | ✔ | ✔ | ✔ | ✖ provider absent | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 35 | Admin dashboard / stats / users / suspend / activate | ✔ | ✔002 | ✔002 | ✔ partial | ✔ | ✔ | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 36 | Moderation reports / decisions | ✔ | ✔016 | ✔016 | ✖ | ✔ moderation_router | — | ✔ | ✖ blocked+migration | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 37 | AI usage logs + admin stat | ✔ | ✔017 | ✔017 | ✖ | ✔ | — | ✔ | ✖ blocked+migration | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 38 | Notifications (create/persist/unread/read-all/events) | ✔ | ✔006 | ✔006 | ✔ | ✔ | ✔ | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 39 | Health endpoint | ✔ core/health | — | — | — | ✔ /api/v1/health | — | ✔ | ✖ blocked | IMPLEMENTED_NOT_RUNTIME_VERIFIED |
| 40 | Celery tasks / beat (jobs, ai, matching queues) | ✔ workers | — | — | — | — | — | — | ✔ worker+beat up | IMPLEMENTED_NOT_RUNTIME_VERIFIED |

## Summary

| Class | Count |
|---|---|
| VERIFIED_WORKING | 0 |
| IMPLEMENTED_NOT_RUNTIME_VERIFIED | 33 |
| PARTIALLY_IMPLEMENTED | 1 (Keycloak) |
| IMPLEMENTED_NEEDS_MIGRATION | 1 (Social) |
| BROKEN | 1 (Groups — P0 import) |
| MOCK_OR_SANDBOX | 1 (Payments) |
| NOT_IMPLEMENTED | 1 (Real payment provider) |