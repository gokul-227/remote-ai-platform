# Cut-over history

How production reached its current shape. Kept short; the reasons are in the [ADR log](../decisions/README.md).

| Date (2026) | Change |
| --- | --- |
| Sep | Launch: web and staff console on Cloudflare Workers (OpenNext), API on Render, database, auth and storage on Supabase, jobs imported by a scheduled GitHub Actions workflow. |
| 3 Oct | Incident: a Sentry SDK minor bump broke server rendering on Workers for 21 min; CI gained a real Worker-bundle smoke test. |
| 14 Nov | Durable background processing (Celery worker + Beat, `task_runs`, dead letters, heartbeats) built and verified locally. |
| 15 Nov | OCI A1 VM provisioned. PostgreSQL rehearsal copy from Supabase: 83/83 tables, row counts equal. Nightly backups to OCI enabled and a restore drill passed. |
| 15 Nov | Web and admin moved off Workers (the free per-request CPU limit was exceeded daily by server rendering) into containers behind Caddy on the VM. |
| 15 Nov | **Production cut-over to the VM.** Fresh dump of Supabase restored into PostgreSQL 17 (`ops/vm/cutover-data.sh db`), migrated to head, verified (96 tables, ~53k rows); stored files copied to OCI buckets and verified (`cutover-data.sh files`). Cloudflare A records (proxied) now point at the VM, SSL Full (strict). The worker took over job imports from GitHub Actions. |
| 15 Nov → | Fallback window: the Render service is suspended, not deleted, for about a week. |

## Still open

- WorkOS production activation, then import of existing accounts
  (`apps/api/app/ops/migrate_users_to_workos.py`, idempotent and resumable), switch
  `AUTH_PRIMARY_PROVIDER=workos` / `NEXT_PUBLIC_AUTH_PROVIDER=workos`, later `AUTH_ACCEPT_SUPABASE=false`,
  then delete Supabase.
- After the fallback window: delete Render, Upstash, the Cloudflare Workers and the hosted Sentry project;
  remove transitional workflows (`deploy-frontend.yml`, `keep-render-warm.yml`).
- Public GlitchTip ingest hostname so browser errors from web/admin are reported.
- Slack incoming webhook for the off-VM uptime monitor.
- Restore branch protection on `prod` and `dev`.

## Sign-in migration notes

- WorkOS tokens are verified against the client's JWKS; the first time a subject is seen the API fetches
  the user and links it to an existing account only when the email is verified. `users.auth_subject` is
  never overwritten.
- Passwords are not migrated (sign-in is passwordless). OAuth links (Google, GitHub, Microsoft) re-attach
  by verified email.
- The import tool imports email, verification state and the old subject as `external_id`; a live key
  requires `--allow-production`.
