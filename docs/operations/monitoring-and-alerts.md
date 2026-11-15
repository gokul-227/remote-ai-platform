# Monitoring and alerts

Slack is the single alert channel. Sources: the API/worker notifier (`app/services/slack.py`,
`app/worker/ops.py`), self-hosted GlitchTip and Uptime Kuma (`infra/docker/docker-compose.ops.yml`, compose
project `rap-ops`), a Slack relay (`infra/ops/slack-relay`) that turns webhook-format posts into bot
messages, and GitHub Actions (`deploy-notify.yml`, `infra/ops/slack-notify.sh`).

## Slack channels

| Channel | Setting holding its id | What arrives |
| --- | --- | --- |
| `#alerts-critical` | `SLACK_CHANNEL_ALERTS_CRITICAL` | Health DOWN/DEGRADED, stale worker/scheduler, dead letters, failed or missed backups, incidents, uptime and TLS expiry |
| `#alerts-errors` | `SLACK_CHANNEL_ALERTS_ERRORS` | GlitchTip new issues (api, web, admin) |
| `#deploys` | `SLACK_CHANNEL_DEPLOYS` | Deploy start / success / failure / cancel |
| `#backups` | `SLACK_CHANNEL_BACKUPS` | Every backup and restore-verify report, missed backups |
| `#job-imports` | `SLACK_CHANNEL_JOB_IMPORTS` | Import failures, daily import summary |
| `#signups` | `SLACK_CHANNEL_SIGNUPS` | Each new account (email domain only), sign-up spikes |
| `#security` | `SLACK_CHANNEL_SECURITY` | Role/staff/flag changes, session revocations, auth-failure bursts, identity conflicts, spikes |
| `#costs` | `SLACK_CHANNEL_COSTS` | Free-tier usage at 70 % / 90 % |

Non-production senders prefix messages with `[<APP_ENV>]`.

## Alert catalogue

| Alert | Trigger | Channel | Repeat |
| --- | --- | --- | --- |
| Health component | `/health/ready` or `/health/dependencies` DOWN/DEGRADED | critical | per component+state per `SLACK_DEDUP_SECONDS` (900) |
| Stale heartbeat | newest heartbeat older than `WORKER_HEARTBEAT_STALE_SECONDS` (180) | critical | every 15 min while stale |
| Dead letter | run reached `max_attempts`; staff retry | critical | per task per 15 min; every retry |
| Incident opened / resolved | console | critical | every event |
| Backup report | `POST /api/v1/ops/backups/report` | backups (+ critical if failed) | every event |
| Backup missed | no success in 26 h (08:00 UTC check) | backups + critical | daily |
| Restore unverified | no verified restore in 35 days | backups | daily |
| Import failed | run RETRYING or DEAD | job-imports | per source+state per 15 min |
| Import summary | 07:00 UTC | job-imports | daily |
| Sign-up / spike | each account; > `SLACK_SIGNUP_SPIKE_PER_HOUR` (25)/h | signups (+ security) | event / hourly |
| Privileged change | role, staff roles, bootstrap, status, session revoke, feature flag | security | every event |
| Rejected-token burst | ≥ `SLACK_AUTH_FAILURE_BURST` (30) 401s in 10 min | security | per 15 min |
| Identity conflict | email claimed by another identity / unverified | security | per account per 15 min |
| Free-tier usage | `cost_guard` every 6 h, ≥ `COST_WARN_PERCENT` / `COST_CRITICAL_PERCENT` | costs | per metric+level per day |
| Application error | GlitchTip new issue | errors | grouped by issue |
| Uptime (on VM) | Uptime Kuma: API ready, web, admin; 60 s, 3 failures | critical | on down and up |
| TLS expiry | Uptime Kuma, 21/14/7 days | critical | per threshold |
| Deploys | `deploy-notify.yml` | deploys | every run |

An off-VM monitor (UptimeRobot free, 5 min) also watches the public URLs; until a Slack incoming webhook
is added it notifies by email. `POST /api/v1/ops/uptime-hook` (`UPTIME_HOOK_TOKEN`) accepts webhooks from
any monitor.

## Silencing

- Everything from API/worker: unset `SLACK_BOT_TOKEN` (or one `SLACK_CHANNEL_*`) and restart.
- Repeats: raise `SLACK_DEDUP_SECONDS`, lower `SLACK_MAX_PER_MINUTE` (20 per channel).
- Thresholds: `SLACK_SIGNUP_SPIKE_PER_HOUR`, `SLACK_AUTH_FAILURE_BURST`, `COST_*`, `WORKER_HEARTBEAT_STALE_SECONDS`.
- A scheduled check: remove it from `beat_schedule` in `app/worker/celery_app.py`.
- GlitchTip: disable the project alert or resolve/mute the issue. Uptime Kuma: pause or maintenance window.
- Deploy messages: delete repo variable `SLACK_CHANNEL_DEPLOYS`.

## Access to the ops tools

GlitchTip (`127.0.0.1:8001`) and Uptime Kuma (`127.0.0.1:3001`) listen on the VM's loopback only. Reach
them through an SSH tunnel; admin passwords are `GLITCHTIP_ADMIN_PASSWORD` and
`UPTIME_KUMA_ADMIN_PASSWORD` in Infisical.

## Known gaps

1. Browser error DSNs (`GLITCHTIP_DSN_WEB`, `GLITCHTIP_DSN_ADMIN`) need a public ingest hostname routed
   through Caddy.
2. Dedup and rate limits are per process; a restart can repeat an alert once.
3. Audit-driven alerts fire on flush; a request that later rolls back can alert on a change that did not persist.
