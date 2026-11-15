# Ops stack on the VM (Slack is the single point of contact)

`infra/docker/docker-compose.ops.yml` runs, independent of the app stack:

| Service | What | Reach it |
| --- | --- | --- |
| glitchtip-web / -worker / -postgres / -valkey | Sentry-compatible error tracking | `127.0.0.1:8001` on the VM |
| uptime-kuma | Uptime + TLS-expiry monitors | `127.0.0.1:3001` on the VM |
| slack-relay | Slack incoming-webhook format -> `chat.postMessage` (bot token) | private `ops` network only |

```bash
ssh -i ~/.ssh/oci_rap -L 8001:127.0.0.1:8001 -L 3001:127.0.0.1:3001 opc@$VM_HOST
# GlitchTip  http://localhost:8001   Uptime Kuma  http://localhost:3001
# both: user = the owner email in Infisical (OWNER_EMAIL), passwords GLITCHTIP_ADMIN_PASSWORD /
# UPTIME_KUMA_ADMIN_PASSWORD in Infisical prod /automation
```

Deploy / update (VM layout mirrors the repo so relative paths resolve):

```bash
/opt/rap/ops/docker/docker-compose.ops.yml   <- infra/docker/docker-compose.ops.yml
/opt/rap/ops/ops/slack-relay/relay.py        <- infra/ops/slack-relay/relay.py
/opt/rap/ops/ops.env                         <- Infisical prod /automation: GLITCHTIP_SECRET_KEY,
                                                GLITCHTIP_DB_PASSWORD, SLACK_BOT_TOKEN, SLACK_CHANNEL_*
cd /opt/rap/ops && docker compose -p rap-ops --env-file ops.env -f docker/docker-compose.ops.yml up -d
```

Wiring:

* API / worker: `SENTRY_DSN=$GLITCHTIP_DSN` (`http://<key>@glitchtip-web:8080/1`; glitchtip-web
  joins `rap-prod_edge`, the API's network). Sentry SaaS keeps working by changing only the DSN.
* Web / admin (browser) DSNs `GLITCHTIP_DSN_WEB` / `GLITCHTIP_DSN_ADMIN` point at localhost until a
  public ingest hostname is routed through Caddy (e.g. `errors.remoteaiplatform.com -> glitchtip-web:8080`).
* GlitchTip project alerts (api, web, admin): webhook `http://slack-relay:8080/errors`.
* Uptime Kuma notification "Slack #alerts-critical (relay)": `http://slack-relay:8080/critical`.
* `infra/ops/slack-notify.sh` posts one line from scripts/CI (used by `.github/workflows/deploy-notify.yml`).

Runbook (every alert, channel, threshold, silencing): docs/operations/monitoring-and-alerts.md
`transformation/06-monitoring-and-alerts.md`.
