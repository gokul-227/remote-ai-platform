# Incident runbook

Alerts arrive in Slack (see [monitoring-and-alerts.md](monitoring-and-alerts.md)). Open an incident in the
staff console (**Incidents**) for anything Sev 1–2; that also posts to `#alerts-critical`.

## Severity

| Sev | Meaning | Response |
| --- | --- | --- |
| 1 | Site, sign-in or job list down; data exposed or lost; suspected breach | Now. Contain first (roll back, disable), then diagnose |
| 2 | A core journey broken (apply, messaging, profile, resume, contracts) | Same day |
| 3 | Degraded (slow, AI allowance exhausted, imports stale < 3 days) | Next working day |

## First checks

1. Which SHA is live: `/api/version` (web) and `/health/version` (API).
2. `/health/ready`: database, redis, worker, scheduler. As staff: `/health/dependencies`.
3. GitHub Actions: last CI and deploy runs. GlitchTip: new issues.
4. On the VM (SSH, key-only): `docker compose -p rap-prod ps`, `docker compose -p rap-prod logs --tail 200 <service>`,
   `df -h`, `free -m`. API log lines carry `request_id` (clients may send `X-Request-ID`).

## Common cases

| Symptom | Action |
| --- | --- |
| Bad release | [Rollback](rollback.md). |
| Whole site 52x through Cloudflare | Check VM is up (OCI console), `caddy` logs (certificate renewal needs `CLOUDFLARE_API_TOKEN` with DNS edit), firewall 80/443. |
| Database down | `postgres` container logs; disk space; never delete the `rap-prod_postgres_data` volume. |
| Redis down | API keeps serving with in-memory rate limits; imports and email pause. Restart `redis`. |
| Worker/scheduler heartbeat stale | Restart `worker`/`scheduler`; check egress (they need internet for job boards, AI, Slack). |
| Dead letters | Read the error in **Background processing**, fix the cause, retry with a reason. |
| Imports stale | **Job sources**: per-source status; a FAILED source never expires its jobs. |
| AI failing | Users get the manual path; check provider keys in the chain and allowance usage. |
| Emails not sent | `email_outbox` backlog; Brevo daily cap (see [free-tier-limits.md](free-tier-limits.md)). |
| Disk filling | `docker system prune` of old images; local backups keep only 3. |
| VM reclaimed or lost | Recreate VM, install Docker, render env, restore latest backup into a fresh PostgreSQL 17, deploy the last `prod` SHA, point Cloudflare A records at the new IP. |
| Leaked secret | Rotate at the provider first, update Infisical, re-render env, revoke the old key. |
| Data loss | Stop writes; follow [backups-restore.md](backups-restore.md); decide on reconciliation in writing. |

## Rollback triggers

Security regression, failed critical journey, clearly higher error rate or latency, schema
incompatibility, quota exhaustion, integrity mismatch.

## Afterwards

Resolve the incident in the console with a short blameless summary: timeline, impact, cause, fix, and
the test or alert that now covers it.

## Support requests (non-incident)

| Request | Handling |
| --- | --- |
| Delete my account while contracts/payments exist | Self-service refuses (409). Suspend, remove profile content and resume, keep contract rows per retention, confirm in writing. |
| Data export | Settings → Privacy → Download my data. |
| Moderation appeal | Review the decision (never reveal the reporter); reverse if wrong. |
| "Different sign-in method" conflict | Verify control of both identities, then link; record the reason. |
