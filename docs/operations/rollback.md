# Rollback

## Application release

- **Automatic:** `deploy.sh` resets image tags to `/opt/rap/state/previous.env`, runs `up -d` and re-runs
  the health gate when a new release fails its gate.
- **Manual, on the VM:** `bash /opt/rap/repo/infra/docker/deploy.sh --rollback`.
- **Manual, from GitHub:** re-run `deploy-vm.yml` for an earlier `prod` commit after reverting on `prod`
  (preferred when the bad commit should not be redeployed later by accident).

Migrations are not reverted. Every migration is additive and the previous release must run on the newer
schema. Never "fix" by `alembic downgrade` in production: it drops new data. Write a forward fix instead.

## Configuration

Restore the previous value in Infisical, re-run `ops/vm/render-env.sh`, recreate the affected services.

## Sign-in provider (while Supabase Auth still exists)

Set `AUTH_PRIMARY_PROVIDER=supabase` and `AUTH_ACCEPT_SUPABASE=true`, rebuild web and admin with
`NEXT_PUBLIC_AUTH_PROVIDER=supabase` (repo variable `AUTH_PROVIDER`). `users.auth_subject` is never
changed, so Supabase subjects still resolve; WorkOS links in `user_identities` stay inert. Emergency: unset
`WORKOS_CLIENT_ID` to reject every WorkOS token. After the Supabase project is deleted there is no
rollback.

## Data

Restoring data is a last resort; see [backups-restore.md](backups-restore.md). Never restore over newer
writes without a written loss and reconciliation decision.

## Edge

If the origin is unhealthy and the cause is Caddy: `compose up -d --no-deps caddy` with the previous
`CADDY_IMAGE`. Cloudflare records stay proxied and pointed at the VM; there is no other origin.
