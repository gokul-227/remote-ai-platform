# E2E Verification

Date: 2026-08-09
Method: live Python/httpx scripts executed inside the running fresh-clone API container against http://localhost:8000.

## Platform E2E (engineer + company + admin)

Engineer:
- Register -> login -> access token
- Create profile (headline, skills)
- Browse jobs (2 seeded)
- Search jobs (q=engineer)
- Save job, list saved jobs
- Apply to job, list applications
- Create social post, like, comment
- Read notifications

Company:
- Register -> company profile
- Create job, publish job
- View company applications

Admin:
- List users (6)
- Read activity logs
- Health check

Result: PLATFORM E2E PASSED

## WebSocket messaging E2E

- Two users register
- Conversation created via REST
- WebSocket connect with JWT auth
- Real-time message delivery from A to B
- Message persisted and retrievable via REST history

Result: WEBSOCKET E2E PASSED (real-time delivery + persistence verified)

## Task dispatch E2E (uber-like)

- Engineer + company register
- Engineer profile public/open-to-work
- Company profile
- Project created
- Task created
- Offer sent to engineer (OFFERED)
- Engineer accepts (ACCEPTED)
- Duplicate acceptance blocked (409)
- Unauthorized submission by company blocked (403)
- Engineer submits v1 (SUBMITTED)
- Company requests changes (CHANGES_REQUESTED)
- Engineer resubmits v2 (version=2)
- Company approves (APPROVED)
- Task status COMPLETED
- Escrow created (SANDBOX)
- Escrow released
- Payment transaction recorded

Result: TASK DISPATCH E2E PASSED