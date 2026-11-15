# Documentation

Everything about building and running Remote AI Platform lives here. This repository is public: these
docs contain no secrets, personal data or account identifiers. Settings are referred to by their
**Infisical secret name**; values live only in Infisical.

Generated, never hand-edited: [`architecture/`](architecture/) (diagrams + models, `make docs-sync`) and
[`api/`](api/) (OpenAPI). CI fails when they drift (`make docs-check`).

| Area | Documents |
| --- | --- |
| Overview | [architecture.md](architecture.md) |
| Operations | [deploy](operations/deploy.md) · [rollback](operations/rollback.md) · [backups and restore](operations/backups-restore.md) · [incident runbook](operations/incident-runbook.md) · [monitoring and alerts](operations/monitoring-and-alerts.md) · [secrets and config](operations/secrets-and-config.md) · [free-tier limits and costs](operations/free-tier-limits.md) · [cut-over history](operations/cutover-history.md) |
| Development | [local setup](development/local-setup.md) · [testing](development/testing.md) · [end-to-end](development/e2e.md) · [migrations](development/migrations.md) · [conventions](development/conventions.md) |
| Product | [features](product/features.md) · [feature visibility audit](product/feature-audit.md) · [staff console manual](product/staff-console.md) · [job ingestion and sources](product/job-ingestion.md) · [privacy and data handling](product/privacy-and-data.md) |
| Decisions | [ADR log](decisions/README.md) |
| Research | [competitor research](research/competitors.md) |

Production in one line: one Oracle Cloud VM running docker compose, Cloudflare in front for DNS and
proxy, Oracle Object Storage for files and backups, Brevo for email, WorkOS for sign-in (Supabase Auth
being retired), Slack for every alert, Infisical for every secret. There is no dev environment.
