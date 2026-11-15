# Decision log

Short records of decisions that shape the code. Newest last. Status: accepted unless noted.

| # | Date | Decision | Why / consequence |
| --- | --- | --- | --- |
| 001 | 2026-09 | Keep the small `useApi` hook for data fetching, keyed by account + path + params; no React Query yet. | Avoid churn while routing and auth change; no cross-account cache leaks. Revisit for shared caching. |
| 002 | 2026-09 | Hash routing for the signed-in app; real server-rendered paths only for public content (job pages first), with real 404s and a sitemap. | Shareable links without a router rewrite; crawlers get public pages. |
| 003 | 2026-09 | Browser calls the API directly with a bearer token; no backend-for-frontend. | Fewer moving parts; XSS controls (strict CSP, no third-party scripts, escaped output) stay launch-blocking. |
| 004 | 2026-09 | Backend Pydantic response models are the API contract; public endpoints get public-only schemas. | Types and privacy filtering from one source. |
| 005 | 2026-09 | No money moves through the platform; payments gated off. | Avoid regulated escrow; copy may not claim escrow. |
| 006 | 2026-11 | Durable background work: Celery worker + single Beat, PostgreSQL `task_runs` as record, Redis as transport. | Retries, dead letters and visibility in the console; replaced scheduled GitHub Actions imports. |
| 007 | 2026-11 | Everything on one Oracle Cloud Always Free VM with docker compose. | Free, enough capacity (arm64), one place to operate. Single point of failure accepted, mitigated by off-host backups and a rebuild runbook. |
| 008 | 2026-11 | Cloudflare is DNS + proxy only; no Workers. | Free Workers CPU limit was exceeded daily by server rendering; Workers deploys also caused the Oct incident. |
| 009 | 2026-11 | Self-hosted PostgreSQL 17 on the VM replaces Supabase as the database. | No free-tier pausing or size cap at 500 MB; we control backups. |
| 010 | 2026-11 | Oracle Object Storage (S3 API) for files and backups. | Free 20 GB on the same provider; existing S3 client reused. Cloudflare R2 dropped. |
| 011 | 2026-11 | WorkOS AuthKit replaces Supabase Auth; the API proxies sign-in and links identities by verified email in `user_identities`. | Free to 1M MAU; removes the last Supabase dependency. Switchable by configuration until Supabase is deleted. |
| 012 | 2026-11 | Brevo for transactional email (replacing Resend). | Larger free daily allowance. |
| 013 | 2026-11 | Slack is the single alert channel; GlitchTip and Uptime Kuma self-hosted on the VM. | One place to look; free. Replaced Sentry SaaS and planned Grafana Cloud. |
| 014 | 2026-11 | Infisical is the only secret source; the VM env is rendered from it. | No secrets in the repo, CI or docs. |
| 015 | 2026-11 | No dev environment; `dev` is a CI-only branch. Local stacks and e2e mocks cover pre-release testing. | Halves operations; avoided a second set of free-tier accounts. |
| 016 | 2026-11 | Docs live in this repo under `docs/`; the private companion docs repo is retired. | One source of truth next to the code; docs written public-safe. |

## Considered and dropped

| Option | Outcome |
| --- | --- |
| Render (API hosting) | Used until the VM cut-over; free instance sleeps; retired. |
| Supabase (database, storage, auth) | Database and storage moved to the VM/OCI; auth moving to WorkOS. |
| Cloudflare Workers (web via OpenNext) | Retired, see 008. |
| Neon (dev database) | Not needed without a dev environment. |
| Upstash Redis | Celery polling would exhaust the free quota; Redis runs in compose. |
| Cloudflare R2 | Needs separate billing; OCI storage chosen. |
| Grafana Cloud | Not needed; Slack + GlitchTip + Uptime Kuma cover alerting. |
| Firebase Cloud Messaging | Replaced by standard Web Push (VAPID). |
| AWS | Considered as a paid fallback; not needed. |
