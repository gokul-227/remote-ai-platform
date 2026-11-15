# Deploy

Production deploys from the `prod` branch only. There is no dev environment; `dev` is a CI-only branch.

## Automatic path

1. Push to `prod` → CI (`ci.yml`) passes → `.github/workflows/deploy-vm.yml` runs.
2. **Build:** web, admin, api and caddy images per architecture on native runners
   (`ubuntu-24.04`, `ubuntu-24.04-arm`), merged into multi-arch manifests tagged `<sha>` and `prod` in GHCR.
3. **Deploy job** (GitHub environment `production`): copies `docker-compose.prod.yml`, `Caddyfile`,
   `deploy.sh` and the postgres config to `/opt/rap/repo/infra/docker/` on the VM, logs the VM in to GHCR
   with the job token (logged out afterwards) and runs `infra/docker/deploy.sh <sha>`.
4. `deploy-notify.yml` posts start / success / failure to Slack `#deploys`.

A manual `workflow_dispatch` builds any branch but deploys only the tip of `prod` with `deploy` ticked.

## What `deploy.sh` does

1. Saves current image tags to `/opt/rap/state/previous.env`.
2. Rewrites `RAP_IMAGE`, `WEB_IMAGE`, `ADMIN_IMAGE` in `/opt/rap/.env` to `<sha>`; `compose pull`.
3. `compose run --rm --no-deps api alembic upgrade head` (forward only).
4. `compose up -d --no-deps api worker scheduler web admin` — postgres and redis are never recreated;
   caddy only when `EDGE_ENABLED=true`.
5. **Health gate** (up to ~150 s): `127.0.0.1:3000/api/version` reports `<sha>`, `/` and `/robots.txt`
   return 200, the admin console answers on `127.0.0.1:3002`, API `/health/ready` returns 200.
6. Gate failure → automatic [rollback](rollback.md) to the previous tags; the job fails.

## GitHub settings used

Secret `VM_SSH_KEY`; variables `VM_HOST`, `VM_SSH_KNOWN_HOSTS`, optional `VM_SSH_USER`, `VM_EDGE_LIVE`
(enables the through-Cloudflare smoke test), `SLACK_CHANNEL_DEPLOYS`; secret `SLACK_BOT_TOKEN`.

## Changing configuration without a release

1. Change the value in Infisical (prod `/render-api` or `/vm`).
2. From a workstation logged in to Infisical: `ops/vm/render-env.sh` (re-renders `/opt/rap/.env`,
   keeps the VM's own `POSTGRES_PASSWORD` and image tags; values are never printed).
3. On the VM: `cd /opt/rap/repo/infra/docker && docker compose --env-file /opt/rap/.env -f docker-compose.prod.yml up -d --no-deps api worker scheduler`.

Build-time settings (`NEXT_PUBLIC_*`, e.g. `NEXT_PUBLIC_AUTH_PROVIDER`) need a new image: re-run the deploy.

## Rules

- Migrations must stay backward compatible with the previous release (rollback does not downgrade).
- Never run a bare `docker compose up -d` on the VM: always `--no-deps` with named services, so postgres
  is not recreated.
- Verify a release with `/api/version` and `/health/version`, not by the workflow colour alone.
