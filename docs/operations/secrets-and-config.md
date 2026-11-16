# Secrets and configuration

**Infisical is the only source of secrets.** Nothing secret goes in this repository, in docs, in chat or
on a command line. This page lists setting **names** only. Full list with defaults:
`apps/api/app/core/config.py`; VM compose names: `infra/docker/.env.prod.example`.

## Infisical layout (environment `prod`)

| Folder | Used by | Contents |
| --- | --- | --- |
| `/render-api` | API, worker, scheduler (historic name, kept) | Application settings |
| `/vm` | API, worker, scheduler on the VM | VM overrides: OCI storage, Brevo, Slack, push, WorkOS |
| `/automation` | Ops stack, scripts | Slack bot and channels, GlitchTip, Uptime Kuma, uptime hook |
| `/` | Operators | Provider API tokens (e.g. `CLOUDFLARE_API_TOKEN`) |

`ops/vm/render-env.sh` merges `/render-api` then `/vm` (later wins), drops `DATABASE_URL`, `REDIS_URL`,
`CELERY_*` (compose owns them), keeps `POSTGRES_PASSWORD` and image tags from the VM, and installs
`/opt/rap/.env` (mode 600). Values are never printed. The ops stack reads `/opt/rap/ops/ops.env`; backups
read `/opt/rap/backup.env` (root only).

## Setting names by area

| Area | Names |
| --- | --- |
| Runtime | `APP_ENV`, `DEBUG`, `APP_URL`, `API_URL`, `FRONTEND_URL`, `ADMIN_URL`, `CORS_ORIGINS`, `WEB_CONCURRENCY`, `API_PUBLIC_HOST`, `EDGE_ENABLED` |
| Images | `RAP_IMAGE`, `WEB_IMAGE`, `ADMIN_IMAGE`, `CADDY_IMAGE` |
| Database | `POSTGRES_PASSWORD`, `RAP_DATABASE_URL`, `DATABASE_POOL_*`, `DATABASE_SIZE_BUDGET_MB` |
| Edge | `CLOUDFLARE_API_TOKEN` (DNS edit, for Caddy DNS-01) |
| Sign-in | `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_ISSUERS`, `WORKOS_AUTHORIZE_URL`, `AUTH_PRIMARY_PROVIDER`, `AUTH_ACCEPT_SUPABASE`; transitional `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; OAuth `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`, `MICROSOFT_OAUTH_CLIENT_ID` |
| Storage | `STORAGE_PROVIDER`, `MINIO_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_SECURE`, `MINIO_BUCKET_RESUMES`, `MINIO_BUCKET_ASSETS`, `MINIO_BUCKET_DELIVERABLES`, `FILES_BUCKET`, `FILES_MAX_UPLOAD_MB`, `FILES_USER_QUOTA_MB`, `FILES_TRASH_RETENTION_DAYS`, `OCI_S3_*` (usage metering) |
| Email | `EMAIL_PROVIDER`, `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `SUPPORT_EMAIL` |
| AI | `AI_FREE_TIER_CHAIN`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `CEREBRAS_API_KEY`, `MISTRAL_API_KEY`, `AI_FREE_MONTHLY_TOKENS`, `AI_GLOBAL_DAILY_TOKENS` |
| Job sources | `USAJOBS_AUTH_KEY`, `THEMUSE_API_KEY`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `ADZUNA_LICENSE_CONFIRMED`, `JOOBLE_API_KEY`, `WORKINGNOMADS_PERMISSION_CONFIRMED`, `GREENHOUSE_BOARDS`, `LEVER_BOARDS`, `ASHBY_BOARDS`, `SMARTRECRUITERS_COMPANIES` |
| Search | `GOOGLE_INDEXING_CREDENTIALS_B64`, `INDEXNOW_KEY` |
| Push | `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` |
| Contacts invites | `INVITE_SIGNING_KEY`, `CONTACT_INVITES_PER_DAY` |
| Alerts | `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_*` (8), `SLACK_DEDUP_SECONDS`, `SLACK_MAX_PER_MINUTE`, `UPTIME_HOOK_TOKEN`, `COST_*` |
| Errors | `SENTRY_DSN` (= `GLITCHTIP_DSN`), `GLITCHTIP_DSN_WEB`, `GLITCHTIP_DSN_ADMIN`, `GLITCHTIP_SECRET_KEY`, `GLITCHTIP_DB_PASSWORD`, `GLITCHTIP_ADMIN_PASSWORD`, `UPTIME_KUMA_ADMIN_PASSWORD` |
| Backups | `BACKUP_PASSPHRASE`, `BACKUP_REPORT_TOKEN`, `BACKUP_REPORT_URL`, `ARCHIVE_BUCKET`, `ARCHIVE_KEEP`, `BACKUP_ENVIRONMENT` |
| Payments (off) | `MARKETPLACE_PAYMENTS_ENABLED`, `PAYMENT_PROVIDER` |
| Billing ([billing.md](billing.md)) | `BILLING_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `BILLING_FREE_PROPOSALS_MONTHLY`, `BILLING_SPONSORED_DEFAULT_CPC_CENTS`, `BILLING_REFERRAL_CREDIT_CENTS`, `BILLING_MESSAGE_REFUND_DAYS` |

## GitHub

Secrets: `VM_SSH_KEY`, `SLACK_BOT_TOKEN`. Variables: `VM_HOST`, `VM_SSH_KNOWN_HOSTS`, `VM_SSH_USER`,
`VM_EDGE_LIVE`, `SLACK_CHANNEL_DEPLOYS`, `AUTH_PROVIDER`. Browser-public values are variables, never secrets.

## Rotation

Rotate at the provider, update Infisical, run `render-env.sh`, recreate the services, revoke the old
value. Any value ever pasted into a chat, issue or log counts as leaked.
