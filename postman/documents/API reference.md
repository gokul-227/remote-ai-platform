# API reference

Every request in the collection, in run order.

## Health & Operations

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| Service version and git commit SHA (root) | `GET /health/version` | Public |  |  |
| Process liveness check (root) | `GET /health/live` | Public |  |  |
| Service readiness check (root) | `GET /health/ready` | Public |  |  |
| Deep dependencies diagnostic (root) | `GET /health/dependencies` | Bearer |  |  |
| Standard health check (Readiness alias) (root) | `GET /health` | Public |  |  |
| Job ingestion freshness per source (OBS-01/OBS-03) (root) | `GET /health/ingestion` | Public |  |  |
| Service version and git commit SHA (API v1) | `GET /api/v1/health/version` | Public |  |  |
| Process liveness check (API v1) | `GET /api/v1/health/live` | Public |  |  |
| Service readiness check (API v1) | `GET /api/v1/health/ready` | Public |  |  |
| Deep dependencies diagnostic (API v1) | `GET /api/v1/health/dependencies` | Bearer |  |  |
| Standard health check (Readiness alias) (API v1) | `GET /api/v1/health` | Public |  |  |
| Job ingestion freshness per source (OBS-01/OBS-03) (API v1) | `GET /api/v1/health/ingestion` | Public |  |  |

## Authentication

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| Logout All Sessions | `POST /api/v1/auth/logout-all` | Bearer |  |  |
| Logout | `POST /api/v1/auth/logout` | Bearer |  |  |
| My Ai Usage | `GET /api/v1/auth/me/ai-usage` | Bearer |  |  |
| Get Me | `GET /api/v1/auth/me` | Bearer |  |  |
| Export My Data | `GET /api/v1/auth/me/export` | Bearer |  |  |
| Update Me | `PATCH /api/v1/auth/me` | Bearer |  |  |
| Update Role | `PATCH /api/v1/auth/role` | Bearer |  |  |
| Delete My Account | `DELETE /api/v1/auth/me` | Bearer |  |  |

## Engineer Profiles

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| Create My Profile | `POST /api/v1/engineers/me` | Bearer |  |  |
| Enhance My Profile | `POST /api/v1/engineers/me/ai-enhance` | Bearer |  |  |
| Upload Resume | `POST /api/v1/engineers/me/resume` | Bearer |  |  |
| List Engineers | `GET /api/v1/engineers` | Public |  | `{{profile_id}}` |
| Get My Profile | `GET /api/v1/engineers/me` | Bearer |  |  |
| Search Engineers | `GET /api/v1/engineers/search` | Public |  |  |
| Get Engineer By Id | `GET /api/v1/engineers/{profile_id}` | Bearer | `{{profile_id}}` |  |
| Update My Profile | `PUT /api/v1/engineers/me` | Bearer |  |  |

## Job Posts

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| Create Job | `POST /api/v1/jobs` | Bearer |  | `{{job_id}}` |
| Trigger Job Sync | `POST /api/v1/jobs/sync` | Bearer |  |  |
| List Jobs | `GET /api/v1/jobs` | Public |  | `{{job_id}}` |
| List Sitemap Entries | `GET /api/v1/jobs/sitemap-entries` | Public |  |  |
| List Company Jobs | `GET /api/v1/jobs/company` | Bearer |  | `{{company_id}}` |
| List Similar Jobs | `GET /api/v1/jobs/{job_id}/similar` | Public | `{{job_id}}` |  |
| List Public Company Jobs | `GET /api/v1/jobs/company/{company_id}` | Public | `{{company_id}}` |  |
| Get Job By Id | `GET /api/v1/jobs/{job_id}` | Bearer | `{{job_id}}` |  |
| Update Job | `PATCH /api/v1/jobs/{job_id}` | Bearer | `{{job_id}}` |  |

## Company Profiles

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| Create My Company | `POST /api/v1/companies/me` | Bearer |  |  |
| Get My Company | `GET /api/v1/companies/me` | Bearer |  |  |
| List Public Companies | `GET /api/v1/companies/public` | Public |  |  |
| Get Company By Id | `GET /api/v1/companies/{company_id}` | Public | `{{company_id}}` |  |
| Update My Company | `PUT /api/v1/companies/me` | Bearer |  |  |

## Global Search

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| Global Search | `GET /api/v1/search` | Public |  |  |

## AI Matching Engine

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| Get My Job Recommendations | `GET /api/v1/matching/recommendations` | Bearer |  |  |
| Get My Match For Job | `GET /api/v1/matching/jobs/{job_id}` | Bearer | `{{job_id}}` |  |
| Get Candidates For Job | `GET /api/v1/matching/candidates/{job_id}` | Bearer | `{{job_id}}` |  |
| Update Match Status | `PATCH /api/v1/matching/{match_id}/status` | Bearer | `{{match_id}}` |  |

## Social Feed

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| Create a post | `POST /api/v1/social/posts` | Bearer |  | `{{post_id}}` |
| Toggle like on a post | `POST /api/v1/social/posts/{post_id}/like` | Bearer | `{{post_id}}` |  |
| Add a comment to a post | `POST /api/v1/social/posts/{post_id}/comments` | Bearer | `{{post_id}}` | `{{comment_id}}` |
| Get personalized feed | `GET /api/v1/social/feed` | Bearer |  |  |
| Public post feed | `GET /api/v1/social/posts/public` | Bearer |  |  |
| List post comments | `GET /api/v1/social/posts/{post_id}/comments` | Bearer | `{{post_id}}` | `{{comment_id}}` |
| Get single post | `GET /api/v1/social/posts/{post_id}` | Bearer | `{{post_id}}` |  |
| Update own post | `PATCH /api/v1/social/posts/{post_id}` | Bearer | `{{post_id}}` |  |
| Delete own post | `DELETE /api/v1/social/posts/{post_id}` | Bearer | `{{post_id}}` |  |
| Delete a comment | `DELETE /api/v1/social/posts/{post_id}/comments/{comment_id}` | Bearer | `{{post_id}}`, `{{comment_id}}` |  |

## groups

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| Create Group | `POST /api/v1/groups` | Bearer |  | `{{group_id}}` |
| Join Group | `POST /api/v1/groups/{group_id}/join` | Bearer | `{{group_id}}` |  |
| Leave Group | `POST /api/v1/groups/{group_id}/leave` | Bearer | `{{group_id}}` |  |
| Create Group Post | `POST /api/v1/groups/{group_id}/posts` | Bearer | `{{group_id}}` | `{{post_id}}` |
| List Groups | `GET /api/v1/groups` | Bearer |  | `{{group_id}}` |
| List Members | `GET /api/v1/groups/{group_id}/members` | Bearer | `{{group_id}}` | `{{user_id}}` |
| My Groups | `GET /api/v1/groups/me/joined` | Bearer |  |  |
| List Group Posts | `GET /api/v1/groups/{group_id}/posts` | Bearer | `{{group_id}}` | `{{post_id}}` |
| Get Group | `GET /api/v1/groups/{group_id}` | Bearer | `{{group_id}}` |  |
| Update Group | `PATCH /api/v1/groups/{group_id}` | Bearer | `{{group_id}}` |  |
| Update Member Role | `PATCH /api/v1/groups/{group_id}/members/{user_id}/role` | Bearer | `{{group_id}}`, `{{user_id}}` |  |
| Delete Group | `DELETE /api/v1/groups/{group_id}` | Bearer | `{{group_id}}` |  |
| Delete Group Post | `DELETE /api/v1/groups/{group_id}/posts/{post_id}` | Bearer | `{{group_id}}`, `{{post_id}}` |  |

## Trust & Reputation

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| Submit project review | `POST /api/v1/trust/reviews` | Bearer |  | `{{user_id}}` |
| Add verification badge | `POST /api/v1/trust/verifications` | Bearer |  | `{{user_id}}`, `{{verification_id}}` |
| Admin verification queue | `GET /api/v1/trust/verifications` | Bearer |  | `{{user_id}}`, `{{verification_id}}` |
| Get explainable trust score | `GET /api/v1/trust/scores/{user_id}` | Bearer | `{{user_id}}` |  |
| List user reviews | `GET /api/v1/trust/reviews/{user_id}` | Bearer | `{{user_id}}` |  |
| List user verifications | `GET /api/v1/trust/verifications/{user_id}` | Bearer | `{{user_id}}` |  |
| Admin: verify or reject a submitted credential | `PATCH /api/v1/trust/verifications/{verification_id}/review` | Bearer | `{{verification_id}}` |  |

## Admin Operations

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| Retry Identity Erasures | `POST /api/v1/admin/erasures/retry` | Bearer |  |  |
| Reclean Job Text | `POST /api/v1/admin/jobs/reclean-text` | Bearer |  |  |
| Get Admin Dashboard | `GET /api/v1/admin/dashboard` | Bearer |  |  |
| Get Platform Stats | `GET /api/v1/admin/stats` | Bearer |  |  |
| Get Sync Logs | `GET /api/v1/admin/sync-logs` | Bearer |  |  |
| Get Activity Logs | `GET /api/v1/admin/activity-logs` | Bearer |  |  |
| List All Users | `GET /api/v1/admin/users` | Bearer |  | `{{user_id}}` |
| List Audit Events | `GET /api/v1/admin/audit-events` | Bearer |  |  |
| List All Jobs | `GET /api/v1/admin/jobs` | Bearer |  |  |
| Get Feature Flags | `GET /api/v1/admin/feature-flags` | Bearer |  |  |
| Get Ai Usage Stats | `GET /api/v1/admin/ai-usage` | Bearer |  |  |
| Get System Health Details | `GET /api/v1/admin/health/details` | Bearer |  |  |
| Update User Status | `PATCH /api/v1/admin/users/{user_id}/status` | Bearer | `{{user_id}}` |  |
| Update User Role | `PATCH /api/v1/admin/users/{user_id}/role` | Bearer | `{{user_id}}` |  |
| Update Job Status | `PATCH /api/v1/admin/jobs/{job_id}/status` | Bearer | `{{job_id}}` |  |
| Delete User | `DELETE /api/v1/admin/users/{user_id}` | Bearer | `{{user_id}}` |  |
| Delete Job | `DELETE /api/v1/admin/jobs/{job_id}` | Bearer | `{{job_id}}` |  |

## Moderation

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| Create Report | `POST /api/v1/moderation/reports` | Bearer |  |  |
| List Reports | `GET /api/v1/moderation/reports` | Bearer |  |  |
| Decide Report | `PATCH /api/v1/moderation/reports/{report_id}` | Bearer | `{{report_id}}` |  |

## Saved Jobs

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| List Saved Jobs | `GET /api/v1/saved-jobs` | Bearer |  |  |
| Save Job | `POST /api/v1/saved-jobs/{job_id}` | Bearer | `{{job_id}}` |  |
| Unsave Job | `DELETE /api/v1/saved-jobs/{job_id}` | Bearer | `{{job_id}}` |  |

## Applications

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| List Applications | `GET /api/v1/applications/me` | Bearer |  |  |
| List Company Applications | `GET /api/v1/applications/company` | Bearer |  |  |
| Apply To Job | `POST /api/v1/applications/jobs/{job_id}` | Bearer | `{{job_id}}` |  |
| Withdraw Application | `PATCH /api/v1/applications/{application_id}/withdraw` | Bearer | `{{application_id}}` |  |
| Invite Engineer | `POST /api/v1/applications/jobs/{job_id}/invite/{engineer_id}` | Bearer | `{{job_id}}`, `{{engineer_id}}` |  |
| Respond To Invitation | `PATCH /api/v1/applications/{application_id}/respond` | Bearer | `{{application_id}}` |  |
| Update Application Status | `PATCH /api/v1/applications/{application_id}/status` | Bearer | `{{application_id}}` |  |

## Contracts

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| Create contract | `POST /api/v1/contracts` | Bearer |  | `{{contract_id}}` |
| Digital sign contract | `POST /api/v1/contracts/{contract_id}/sign` | Bearer | `{{contract_id}}` |  |
| Terminate contract | `POST /api/v1/contracts/{contract_id}/terminate` | Bearer | `{{contract_id}}` |  |
| Add milestone | `POST /api/v1/contracts/{contract_id}/milestones` | Bearer | `{{contract_id}}` | `{{milestone_id}}` |
| List my contracts | `GET /api/v1/contracts/me` | Bearer |  |  |
| Get contract details | `GET /api/v1/contracts/{contract_id}` | Bearer | `{{contract_id}}` |  |
| Update contract | `PATCH /api/v1/contracts/{contract_id}` | Bearer | `{{contract_id}}` |  |
| Update contract milestone status | `PATCH /api/v1/contracts/{contract_id}/milestones/{milestone_id}/status` | Bearer | `{{contract_id}}`, `{{milestone_id}}` |  |

## Projects

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| Create Project | `POST /api/v1/projects` | Bearer |  |  |
| Create Milestone | `POST /api/v1/projects/milestones` | Bearer |  |  |
| Create Task | `POST /api/v1/projects/tasks` | Bearer |  |  |
| Record Work Ledger Entry | `POST /api/v1/projects/tasks/{task_id}/ledger` | Bearer | `{{task_id}}` |  |
| Create Project Review | `POST /api/v1/projects/{project_id}/reviews` | Bearer | `{{project_id}}` |  |
| Create Sandbox Escrow | `POST /api/v1/projects/{project_id}/payments/escrow` | Bearer | `{{project_id}}` |  |
| Create Task Offer | `POST /api/v1/projects/tasks/{task_id}/offers` | Bearer | `{{task_id}}` |  |
| Submit Task Work | `POST /api/v1/projects/tasks/{task_id}/submissions` | Bearer | `{{task_id}}` |  |
| Ai Review Submission | `POST /api/v1/projects/submissions/{submission_id}/ai-review` | Bearer | `{{submission_id}}` |  |
| Add Task Dependency | `POST /api/v1/projects/tasks/{task_id}/dependencies` | Bearer | `{{task_id}}` |  |
| Add Task Comment | `POST /api/v1/projects/tasks/{task_id}/comments` | Bearer | `{{task_id}}` |  |
| Generate Project Plan | `POST /api/v1/projects/{project_id}/plan` | Bearer | `{{project_id}}` |  |
| Approve Project Plan | `POST /api/v1/projects/{project_id}/approve-plan` | Bearer | `{{project_id}}` |  |
| Generate Progress Summary | `POST /api/v1/projects/{project_id}/ai/progress-summary` | Bearer | `{{project_id}}` |  |
| Generate Risk Analysis | `POST /api/v1/projects/{project_id}/ai/risk-analysis` | Bearer | `{{project_id}}` |  |
| Generate Documentation | `POST /api/v1/projects/{project_id}/ai/documentation` | Bearer | `{{project_id}}` |  |
| List Projects | `GET /api/v1/projects` | Bearer |  |  |
| List Task Offers | `GET /api/v1/projects/task-offers` | Bearer |  |  |
| List My Task Offers | `GET /api/v1/projects/my-offers` | Bearer |  |  |
| List My Assigned Tasks | `GET /api/v1/projects/my-tasks` | Bearer |  |  |
| List Milestones | `GET /api/v1/projects/{project_id}/milestones` | Bearer | `{{project_id}}` |  |
| List Project Tasks | `GET /api/v1/projects/{project_id}/tasks` | Bearer | `{{project_id}}` |  |
| List Project Ledger | `GET /api/v1/projects/{project_id}/ledger` | Bearer | `{{project_id}}` |  |
| List Project Payments | `GET /api/v1/projects/{project_id}/payments` | Bearer | `{{project_id}}` |  |
| List Project Reviews | `GET /api/v1/projects/{project_id}/reviews` | Bearer | `{{project_id}}` |  |
| List Task Submissions | `GET /api/v1/projects/tasks/{task_id}/submissions` | Bearer | `{{task_id}}` |  |
| List Ai Reports | `GET /api/v1/projects/{project_id}/ai-report` | Bearer | `{{project_id}}` |  |
| List Project Activity | `GET /api/v1/projects/{project_id}/activity` | Bearer | `{{project_id}}` |  |
| Get Reputation | `GET /api/v1/projects/reputation/{user_id}` | Bearer | `{{user_id}}` |  |
| Project Detail | `GET /api/v1/projects/{project_id}` | Bearer | `{{project_id}}` |  |
| Update Project Status | `PATCH /api/v1/projects/{project_id}/status` | Bearer | `{{project_id}}` |  |
| Update Milestone Status | `PATCH /api/v1/projects/milestones/{milestone_id}/status` | Bearer | `{{milestone_id}}` |  |
| Void Work Ledger Entry | `PATCH /api/v1/projects/ledger/{entry_id}/void` | Bearer | `{{entry_id}}` |  |
| Release Sandbox Payment | `PATCH /api/v1/projects/payments/{payment_id}/release` | Bearer | `{{payment_id}}` |  |
| Refund Sandbox Payment | `PATCH /api/v1/projects/payments/{payment_id}/refund` | Bearer | `{{payment_id}}` |  |
| Respond To Task Offer | `PATCH /api/v1/projects/task-offers/{offer_id}` | Bearer | `{{offer_id}}` |  |
| Cancel Task Offer | `PATCH /api/v1/projects/task-offers/{offer_id}/cancel` | Bearer | `{{offer_id}}` |  |
| Review Task Submission | `PATCH /api/v1/projects/submissions/{submission_id}/review` | Bearer | `{{submission_id}}` |  |
| Update Task | `PATCH /api/v1/projects/tasks/{task_id}` | Bearer | `{{task_id}}` |  |

## Notifications

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| List notifications for current user | `GET /api/v1/notifications` | Bearer |  |  |
| Count unread notifications | `GET /api/v1/notifications/unread-count` | Bearer |  |  |
| Mark Read | `PATCH /api/v1/notifications/{notification_id}/read` | Bearer | `{{notification_id}}` |  |
| Mark All Read | `PATCH /api/v1/notifications/read-all` | Bearer |  |  |

## Network

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| Block User | `POST /api/v1/blocks` | Bearer |  |  |
| Send Connection | `POST /api/v1/connections` | Bearer |  |  |
| Create Conversation | `POST /api/v1/conversations` | Bearer |  |  |
| Send Message | `POST /api/v1/conversations/{conversation_id}/messages` | Bearer | `{{conversation_id}}` |  |
| List Blocks | `GET /api/v1/blocks` | Bearer |  |  |
| List Connections | `GET /api/v1/connections` | Bearer |  |  |
| List Conversations | `GET /api/v1/conversations` | Bearer |  |  |
| Unread Message Count | `GET /api/v1/conversations/unread-count` | Bearer |  |  |
| Message History | `GET /api/v1/conversations/{conversation_id}/messages` | Bearer | `{{conversation_id}}` |  |
| Update Connection | `PATCH /api/v1/connections/{connection_id}` | Bearer | `{{connection_id}}` |  |
| Unblock User | `DELETE /api/v1/blocks/{user_id}` | Bearer | `{{user_id}}` |  |
| Remove Connection | `DELETE /api/v1/connections/{connection_id}` | Bearer | `{{connection_id}}` |  |

## Payments & Financial Ledger

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| Create escrow payment | `POST /api/v1/payments/escrow` | Bearer |  |  |
| Release escrow payment | `POST /api/v1/payments/{payment_id}/release` | Bearer | `{{payment_id}}` |  |
| Refund escrow payment | `POST /api/v1/payments/{payment_id}/refund` | Bearer | `{{payment_id}}` |  |
| Get user wallet balance overview | `GET /api/v1/payments/wallet` | Bearer |  |  |
| List transaction history | `GET /api/v1/payments/transactions` | Bearer |  |  |

## quality

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| Evaluate Submission | `POST /api/v1/quality/evaluate` | Bearer |  |  |
| Review Code | `POST /api/v1/quality/review-code` | Bearer |  |  |
| Batch Evaluate | `POST /api/v1/quality/batch-evaluate` | Bearer |  |  |
| Quality Dashboard | `GET /api/v1/quality/dashboard` | Bearer |  |  |
| Quality Engine Health | `GET /api/v1/quality/health` | Public |  |  |

## Analytics

| Request | Method & path | Auth | Needs | Sets |
| --- | --- | --- | --- | --- |
| Create Event | `POST /api/v1/analytics/events` | Bearer |  |  |
| Get Events Summary | `GET /api/v1/analytics/events/summary` | Bearer |  |  |
