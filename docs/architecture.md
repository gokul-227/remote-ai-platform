# Architecture

Diagrams: [`architecture/architecture.png`](architecture/architecture.png) (system) and
[`architecture/product.png`](architecture/product.png) (features), generated from
`tools/architecture/*.yaml`.

## Runtime

```
Browser ──HTTPS──▶ Cloudflare (DNS + proxy, SSL Full (strict); no Workers)
                        │
                        ▼
             Oracle Cloud VM (Always Free, arm64)
  ┌──────────────────────── compose project rap-prod ────────────────────────┐
  │ caddy :80/:443  ──▶ web   (Next.js standalone, loopback :3000)            │
  │  (TLS via DNS-01,──▶ admin (static export on Caddy, loopback :3002)       │
  │   rate limits)   ──▶ api   (FastAPI)                                      │
  │ scheduler (Celery Beat) ──▶ redis (broker only) ──▶ worker (Celery)       │
  │ postgres 17 (internal network only, no host port)                         │
  └───────────────────────────────────────────────────────────────────────────┘
  ┌──────────── compose project rap-ops ────────────┐
  │ GlitchTip (errors) · Uptime Kuma · Slack relay  │──▶ Slack
  └─────────────────────────────────────────────────┘
  systemd rap-backup.timer ──▶ encrypted archive ──▶ Oracle Object Storage
```

| Concern | Choice | Where |
| --- | --- | --- |
| Hosting | One OCI Always Free A1 VM; single point of failure, accepted | `infra/docker/docker-compose.prod.yml` |
| Edge | Cloudflare DNS/proxy only; Caddy terminates TLS at the origin | `infra/docker/Caddyfile`, `infra/docker/caddy/` |
| Images | GHCR, multi-arch (arm64 + amd64), tagged by commit SHA | `.github/workflows/deploy-vm.yml` |
| Database | PostgreSQL 17 container, data checksums, tuned config | `infra/docker/postgres/` |
| Queue | Celery + Redis as transport; `task_runs` in PostgreSQL is the record | `apps/api/app/worker/`, `app/domains/tasks/` |
| Object storage | Oracle Object Storage via its S3 API (`MINIO_*` settings, `STORAGE_PROVIDER`) | `app/services/` |
| Email | Brevo (`EMAIL_PROVIDER`), durable `email_outbox` | `app/domains/notifications/` |
| Sign-in | WorkOS AuthKit, proxied by the API; Supabase Auth being retired | `app/domains/auth/` |
| AI | LiteLLM over a free-tier provider chain (`AI_FREE_TIER_CHAIN`), per-user allowances | `app/agents/`, `app/services/ai/` |
| Errors | Self-hosted GlitchTip (Sentry SDK compatible) | `infra/docker/docker-compose.ops.yml` |
| Alerts | Slack bot, eight channels | `app/services/slack.py`, `app/worker/ops.py`, `infra/ops/` |
| Secrets | Infisical, rendered to `/opt/rap/.env` on the VM | `ops/vm/render-env.sh` |
| Backups | Nightly encrypted dump + objects to OCI, monthly restore drills | `ops/backup/` |

## Code

- `apps/api` — FastAPI modular monolith. `app/domains/<context>/` holds `models.py`, `schemas.py`,
  `router.py` (plus `repository.py`, `service.py`). Routers mount under `/api/v1`. Role and ownership live
  in the app's own `users` table; identity-provider subjects are linked through `user_identities`.
- `apps/web` — Next.js 16 / React 19. The signed-in app is hash-routed in `src/figma` (routes in
  `App.tsx`, navigation catalog in `rap_shell.tsx`). Public job pages `/jobs/<id>`, sitemap and robots are
  server-rendered; only production is indexable.
- `apps/admin` — staff console, static export; every staff endpoint enforces `ADMIN` server-side (the
  hostname is not a boundary).
- `tests/e2e` — Playwright journeys on an isolated compose stack with mock identity providers.

## Background work

Beat runs exactly once (PostgreSQL advisory lock; a second Beat exits and compose restarts it). Schedule
(`app/worker/celery_app.py`): `tick_schedule` every 60 s (enqueues imports from `job_sources`),
`dispatch_outbox` 10 s, `requeue_stale` 5 min, `flush_email_outbox` 60 s, `send_digests` 5 min,
`maintain_catalogue` 03:20 UTC, `prune_runs` 04:05, `files.sweep_trash` 04:30, `daily_import_summary`
07:00, `check_backups` 08:00, `cost_guard` every 6 h.

Idempotency key per run (`import:<SOURCE>:<cron slot>` for imports). Retries back off 1 m / 5 m / 15 m /
1 h; after `max_attempts` a run is DEAD and appears in `dead_letters` (retry from the console, reason
required, audited). Workers and the scheduler write `worker_heartbeats`; stale after
`WORKER_HEARTBEAT_STALE_SECONDS` (180).

## Health endpoints

`/health/version` (API SHA), `/api/version` (web SHA), `/health/ready` (database, redis, worker,
scheduler), `/health/dependencies` (admin only: storage, AI last success/failure).
