# Slack: alerts and the `/rap` staff console

Slack is the single point of contact for the platform: every alert lands in a channel, and everything the
staff console (`apps/admin`, `/api/v1/admin/*`) can do can also be done with the `/rap` slash command. The
bot is the existing **RAP Alerts** app; its manifest is [`ops/slack/manifest.yaml`](../../ops/slack/manifest.yaml).

## How `/rap` works

1. Slack posts the command to `POST /api/v1/slack/commands` and button clicks to
   `POST /api/v1/slack/interactions`. Both verify `X-Slack-Signature` with `SLACK_SIGNING_SECRET` and refuse
   timestamps more than 5 minutes off (replays). While the secret is unset every request is refused.
2. The Slack user is mapped to a staff (`ADMIN`) account through the `slack_identities` table. A row is only
   created by redeeming a one-time code generated in the console (**Platform › Integrations › Slack (/rap)**,
   `POST /api/v1/admin/slack/link-code`; valid `SLACK_LINK_CODE_MINUTES`, single use, stored hashed).
   Unlinked, suspended, demoted or other-workspace users get "Not authorised", and `#security` is told.
3. Quick answers (help, link, confirmation prompts) come back inside Slack's 3 seconds. Real work is queued
   on Celery (`slack.run_command`, queue `default`) and the answer is posted to the command's `response_url`.
   If the broker is unreachable the API runs it in-process instead, so `/rap status` still answers when Redis
   is down.
4. Every command calls the same `/api/v1` staff endpoints as the console, in-process, as the linked staff
   member (`app/domains/slack/api.py`). Staff-role scope (`admin/staff.py`), validation and audit are therefore
   identical to the console. Each run also writes a `slack.command` audit row, and every audit row written
   during a Slack call carries `channel: slack` with the staff user as actor.
5. Destructive or monetary commands ("yes" under Confirm) first answer with a **Confirm / Cancel** Block Kit
   prompt. The button carries a token signed with the signing secret, bound to the Slack user who asked and
   valid for `SLACK_CONFIRM_MINUTES`; nobody else can confirm it. Confirming replaces the prompt with the result.
6. `<id|email>` takes a user id or an exact email. `[reason]` is free text recorded in the audit trail
   (default "Slack /rap"). Quote arguments that contain spaces: `/rap sources cron remotive "0 */2 * * *"`.

`/rap help` lists the modules, and `/rap help <module>` shows that module's commands. `/rap link <code>`,
`/rap whoami` and `/rap unlink` manage the link.

## Command reference

This table matches `app/domains/slack/commands.py`. `tests/test_slack_ops.py` fails if a command is missing here.

| Command | What it does | Confirm | Aliases |
| --- | --- | --- | --- |
| `/rap ai actions` | Recent assistant actions |  | `assistant` |
| `/rap ai usage` | AI usage and allowances |  | `ai` |
| `/rap announce create <INFO\|WARNING\|CRITICAL> <title> \| <body>` | Broadcast a banner to every member | yes | `broadcast` |
| `/rap announce end <id>` | Take an announcement down |  |  |
| `/rap announce list` | Announcements |  |  |
| `/rap audit [action prefix]` | Audit log |  | `audit log` |
| `/rap backups` | Last backup and restore check |  | `backups status` |
| `/rap billing entitlements [user id\|email]` | Entitlements |  |  |
| `/rap billing fulfil <purchase id> <queued\|done> [reason]` | Set fulfilment status |  |  |
| `/rap billing grant <user id\|email> <key> [quantity] [days] [reason]` | Grant an entitlement | yes |  |
| `/rap billing plans` | Price list |  | `billing prices` |
| `/rap billing price <plan slug> <price cents> [reason]` | Change a price | yes |  |
| `/rap billing purchases [status]` | Purchases |  |  |
| `/rap billing refund <purchase id> [amount cents] [reason]` | Refund through Stripe | yes |  |
| `/rap billing revenue` | Revenue summary |  | `revenue` |
| `/rap billing revoke <entitlement id> [reason]` | Revoke an entitlement | yes |  |
| `/rap billing subs [status]` | Subscriptions |  | `billing subscriptions` |
| `/rap catalogue` | Service catalogue |  |  |
| `/rap companies list [query]` | Company directory |  |  |
| `/rap contracts list [status]` | Freelancing contracts |  |  |
| `/rap flags list` | Feature flags and overrides |  |  |
| `/rap flags set <name> <on\|off\|default> [reason]` | Override a feature flag | yes |  |
| `/rap imports deadletters` | Open dead letters |  | `tasks deadletters` |
| `/rap imports failures` | Failing and dead import runs |  |  |
| `/rap imports retry <dead letter id> [reason]` | Retry a dead letter |  |  |
| `/rap imports runs [status]` | Latest import runs |  |  |
| `/rap incidents list [status]` | Incidents |  |  |
| `/rap incidents open <SEV1-4> <service> <title> [\| description]` | Open an incident |  |  |
| `/rap incidents status <id> <ACKNOWLEDGED\|INVESTIGATING\|MONITORING\|RESOLVED> [reason]` | Move an incident |  |  |
| `/rap integrations` | Integration settings (feature flags view) |  |  |
| `/rap inventory` | Operations inventory |  |  |
| `/rap jobs delete <job id>` | Delete a listing | yes |  |
| `/rap jobs hidden` | Hidden listings |  |  |
| `/rap jobs hide <job id>` | Hide a listing |  |  |
| `/rap jobs search <query>` | Find listings (hidden ones included) |  |  |
| `/rap jobs unhide <job id>` | Show a hidden listing |  |  |
| `/rap projects list` | Project portfolio |  |  |
| `/rap projects summary` | Delivery operations summary |  |  |
| `/rap reports dismiss <id> [note]` | Dismiss a report |  |  |
| `/rap reports history` | Decided reports |  |  |
| `/rap reports queue` | Open moderation reports |  | `moderation queue` |
| `/rap reports resolve <id> <HIDE_JOB\|SUSPEND_USER\|REMOVE_POST\|NO_ACTION> [note]` | Resolve a report | yes | `moderation resolve` |
| `/rap security` | Security events (privileged changes) |  |  |
| `/rap seo` | Indexing status and sitemap counts |  | `seo status` |
| `/rap sources boards <name>` | ATS boards of a source |  |  |
| `/rap sources cron <name> "<cron>" [reason]` | Set a source schedule |  |  |
| `/rap sources list` | Job sources, schedule and state |  |  |
| `/rap sources pause <name> [reason]` | Stop scheduling a source |  |  |
| `/rap sources resume <name> [reason]` | Resume a source |  |  |
| `/rap sources run <name> [reason]` | Run an import now |  |  |
| `/rap staff list` | Staff accounts and their roles |  |  |
| `/rap staff roles <id\|email> <role,role> [reason]` | Set staff roles (super_admin only) | yes |  |
| `/rap stats` | Platform totals (console overview) |  | `overview` |
| `/rap status` | API, DB, Redis, worker, queue depth, last deploy SHA |  | `health` |
| `/rap tasks overview` | Background processing: runs, outbox, heartbeats |  |  |
| `/rap tasks runs [status] [task]` | Recent background runs |  |  |
| `/rap tickets list [active\|overdue\|mine\|resolved]` | Support queue |  |  |
| `/rap tickets note <id> <message>` | Internal note |  |  |
| `/rap tickets reply <id> <message>` | Reply to the requester |  |  |
| `/rap tickets status <id> <OPEN\|IN_PROGRESS\|WAITING_ON_USER\|RESOLVED\|CLOSED> [reason]` | Move a ticket |  |  |
| `/rap tickets view <id>` | A ticket and its thread |  |  |
| `/rap usage` | Free-tier usage and limits |  |  |
| `/rap users delete <id\|email>` | Permanently delete an account | yes |  |
| `/rap users find <email or name>` | Search accounts |  |  |
| `/rap users role <id\|email> <ENGINEER\|COMPANY\|ADMIN> [reason]` | Change account role | yes |  |
| `/rap users signout <id\|email> [reason]` | Revoke every session | yes |  |
| `/rap users suspend <id\|email> [reason]` | Suspend and sign out | yes |  |
| `/rap users suspended` | Suspended accounts (restricted) |  |  |
| `/rap users unsuspend <id\|email> [reason]` | Reactivate an account |  |  |
| `/rap users view <id\|email>` | One account, its entitlements |  |  |
| `/rap verifications list` | Identity verification queue |  |  |
| `/rap verifications review <id> <verified\|rejected> [note]` | Decide a verification |  |  |

Console sections and their commands: Dashboard (`status`, `stats`); Users (`users`, `staff`), Organisations
(`companies list`), Trust (`verifications`); Safety (`reports`, `users suspended`); Marketplace (`jobs`,
`sources`, `imports`, `tasks`, `contracts list`); Delivery (`projects`); Billing (`billing`); Support
(`tickets`); AI (`ai`); Platform (`flags`, `integrations`, `announce`/`broadcast`, `status`, `incidents`,
`inventory`, `catalogue`, `backups`, `usage`, `seo`); Compliance (`audit`, `security`).

## Interactive alerts

Alerts can carry buttons. `/slack/interactions` handles them with the same identity and scope rules as `/rap`:

| Alert | Buttons |
| --- | --- |
| Job import failed (`#job-imports`) | Run now · Pause source · Acknowledge |
| Task moved to dead letters (`#alerts-critical`) | Retry · Acknowledge |

**Acknowledge** posts "Acknowledged by @user" in the channel and writes `slack.alert.ack` to the audit log. A
button that maps to a confirm-type command asks for confirmation first. To add buttons in code, use
`slack.post(..., actions=slack.alert_buttons(slack.button(label, "rap_alert", "cmd:<rap command>")))`.

## Channel map

| Channel | Setting | What arrives |
| --- | --- | --- |
| `#alerts-critical` | `SLACK_CHANNEL_ALERTS_CRITICAL` | Health DOWN/DEGRADED, stale worker/scheduler, dead letters, missed/failed backups, incidents, Uptime Kuma (uptime, TLS), and from `ops/vm/slack-health.sh`: VM disk/memory/CPU, TLS expiry, Postgres size |
| `#alerts-errors` | `SLACK_CHANNEL_ALERTS_ERRORS` | GlitchTip new issues (through the relay), Stripe Tax off |
| `#deploys` | `SLACK_CHANNEL_DEPLOYS` (repo variable) | Deploy, CI, API image, CodeQL and Release runs (`deploy-notify.yml`) |
| `#backups` | `SLACK_CHANNEL_BACKUPS` | Every backup/restore report, missed backups |
| `#job-imports` | `SLACK_CHANNEL_JOB_IMPORTS` | Import failures (with buttons), board discovery, daily import summary |
| `#signups` | `SLACK_CHANNEL_SIGNUPS` | Each new account and spikes; fallback for `#payments`, `#kpis`, `#seo` |
| `#security` | `SLACK_CHANNEL_SECURITY` | Role/staff/flag changes, session revocations, rejected-token bursts, non-staff accounts on staff endpoints, refused `/rap` users |
| `#costs` | `SLACK_CHANNEL_COSTS` | Free-tier usage, Postgres size included, at 70 % / 90 % |
| `#seo` | `SLACK_CHANNEL_SEO` | Weekly Search Console report (Mondays 07:30 UTC) |
| `#payments` | `SLACK_CHANNEL_PAYMENTS` | New purchases, invoices paid, new and cancelled subscriptions, failed payments, refunds, Stripe Tax off |
| `#kpis` | `SLACK_CHANNEL_KPIS` | Daily digest at 07:05 UTC: users, sign-ups, jobs live, imports, active subscriptions, revenue, Postgres size |

Senders: API and worker (`app/services/slack.py`, `app/worker/ops.py`), the relay for GlitchTip and Uptime
Kuma (`infra/ops/slack-relay`, `http://slack-relay:8080/<channel>`), GitHub Actions (`deploy-notify.yml`),
the VM timer (`ops/vm/slack-health.sh`) and the backup scripts (`ops/backup`, through
`/api/v1/ops/backups/report`). Full alert catalogue: [monitoring-and-alerts.md](monitoring-and-alerts.md).

## Setup

### 1. Slack app (owner, once)

1. api.slack.com/apps → **RAP Alerts** → **App Manifest** → paste `ops/slack/manifest.yaml` → Save. This adds
   the `/rap` command (`https://api.remoteaiplatform.com/api/v1/slack/commands`), interactivity
   (`https://api.remoteaiplatform.com/api/v1/slack/interactions`) and the `commands` and `chat:write.public` scopes.
2. Reinstall the app to the workspace when Slack asks. If Slack issues a new bot token, update
   `SLACK_BOT_TOKEN` in Infisical.
3. **Basic Information → Signing Secret**: store it in Infisical as `SLACK_SIGNING_SECRET`, let the sync reach
   the VM, re-render `/opt/rap/.env` and restart `api` and `worker`.
4. Create `#payments` and `#kpis` (or pick existing channels), invite RAP Alerts, and put their channel ids in
   Infisical as `SLACK_CHANNEL_PAYMENTS` and `SLACK_CHANNEL_KPIS`. Until then both post to `#signups`.

### 2. Each staff member

Console → Platform › Integrations → **Generate link code** → in Slack run `/rap link ABCD-EFGH`. Check with
`/rap whoami`. Unlink in the console or with `/rap unlink`.

### 3. VM health timer

```bash
sudo cp /opt/rap/repo/ops/vm/systemd/rap-slack-health.service /opt/rap/repo/ops/vm/systemd/rap-slack-health.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now rap-slack-health.timer
sudo systemctl start rap-slack-health.service && journalctl -u rap-slack-health -n 20
```

The thresholds are environment variables of the script (`DISK_WARN_PERCENT` 85, `MEM_WARN_PERCENT` 90,
`LOAD_WARN_PER_CORE` 2.0, `TLS_WARN_DAYS` 14, `PG_WARN_MB` 40000, `TLS_HOSTS`). Override them with
`systemctl edit rap-slack-health.service`. Each alert repeats at most hourly and posts one recovery message.

## External services into Slack

None of these can be set up from the repo. Each one needs the owner in that service's dashboard.

| Service | How | Channel | Owner clicks |
| --- | --- | --- | --- |
| GitHub (PRs, issues, releases, Dependabot/security) | Install the **GitHub app for Slack**, then in the channel run `/github subscribe <owner>/<repo> pulls issues releases deployments reviews` | `#deploys` or a new `#github` | Yes: install and authorise the org |
| Cloudflare (DDoS, origin health, SSL/TLS, DNS) | Notifications → Destinations → **Webhooks**, pointing at a Slack incoming-webhook URL; then add the notifications you want | `#alerts-critical` | Yes. Needs an incoming webhook (see below); which alert types are available depends on the Cloudflare plan |
| Oracle Cloud budget | Budget alert rule → **email** to the channel's email address, or an OCI **Notifications** topic with an HTTPS subscription to a Slack incoming webhook | `#costs` | Yes: create the alert or topic and confirm the subscription |
| Stripe | Money events already reach `#payments` from the API's webhook. For account-level events (payouts, disputes, Radar) use Stripe's Slack app or email notifications forwarded to the channel email | `#payments` | Yes |
| WorkOS | Team email alerts forwarded to the channel email. Rejected tokens and non-staff access already reach `#security` from the API | `#security` | Yes |
| Brevo | Account notifications (quota, blocked sender) to the channel email | `#costs` | Yes |
| UptimeRobot (off-VM) | Slack alert contact (incoming webhook), or a webhook to `/api/v1/ops/uptime-hook` with `UPTIME_HOOK_TOKEN` | `#alerts-critical` | Yes |
| GlitchTip, Uptime Kuma | Already wired through `slack-relay` (`http://slack-relay:8080/errors`, `/critical`) | as listed | Only if not yet set in their UIs |

Slack's "Send emails to this channel" needs a paid Slack plan. On the free plan, add the **Incoming Webhooks**
feature to RAP Alerts and create one webhook per target channel; store the URLs in Infisical, not in the repo.

## Operations

- **Turn `/rap` off:** clear `SLACK_SIGNING_SECRET` (every request then gets 401) or remove the command from the
  app. Alerts keep working.
- **Remove someone's access:** unlink them in the console, or suspend or demote the account. `/rap` checks the
  account on every command and every click.
- **Audit:** `/rap audit slack.`, or the console audit log filtered by `slack.`.
- **Rotate the signing secret:** regenerate it in Slack, update Infisical, restart. Unclicked confirmation
  buttons stop working, because they are signed with it.
