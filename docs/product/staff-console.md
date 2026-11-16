# Staff console manual

`apps/admin`, served at the `admin.` hostname, `noindex`. Sign in with an email code; only existing
accounts with role `ADMIN` get in, and every staff endpoint enforces it server-side. Staff roles
(`staff_roles`: super admin, ops admin, support, moderator, engineering operator, auditor) refine what an
admin may change; auditors are read-only. Every mutation asks for a **reason** and is written to the audit
log; privileged changes also post to Slack `#security`.

The first admin is bootstrapped from `ADMIN_EMAILS`; afterwards admins are promoted in **Staff & roles**.

## Screens

| Group | Screen | Use it to |
| --- | --- | --- |
| Overview | Operations overview | Counts, health, queues and backups at a glance |
| People | User directory | Find a member; suspend/reactivate, revoke sessions, change role (reason required) |
| | Staff & roles | Grant or remove staff roles |
| | Company directory · Identity verification | Review organisations and verification requests |
| Trust & safety | Review queue · Moderation history · Restricted accounts | Act on reports (hide content, restrict user, dismiss); appeals |
| Marketplace | Job listings | Pause/reactivate/delete jobs; re-clean imported text |
| | Job sources | Enable/disable sources, schedule, caps, permission flag; run an import manually |
| | Background processing | Task runs, queues, dead letters (retry with reason), worker/scheduler heartbeats |
| | Contracts · Project portfolio | Inspect contracts and projects for support cases |
| Billing & Revenue | Revenue · Purchases & refunds · Subscriptions · Entitlements · Prices | MRR, churn, one-off and ad revenue from recorded Stripe events; refund through Stripe and mark social boosts done; grant or revoke entitlements; edit prices and availability (reason required, audited). See [billing](../operations/billing.md) |
| Support | Ticket queue · My assigned tickets · Resolved | Answer tickets, internal notes, SLA |
| AI | AI usage & allowances · Assistant activity | Token use by feature, per-user allowances, assistant tool calls |
| Configuration | Feature flags | Override flags (audited); defaults come from settings |
| | Integrations · Announcements | Provider status; site-wide notices |
| Operations | System status · Incidents | Health detail; open/resolve incidents (posts to `#alerts-critical`) |
| | Operations inventory · Service catalogue | Registered API routes; components, owners, runbooks |
| | Backups | Last backup and last verified restore (ok = backup < 26 h, restore < 35 days) |
| | Usage & limits | Free-tier usage vs limits ([free-tier-limits](../operations/free-tier-limits.md)) |
| | Google search | Indexing submissions and quota |
| Compliance | Audit log · Security events | Who did what, when and why; auth failures and identity conflicts |

## Rules

- Least data access; no impersonation.
- Prefer suspension to deletion. Self-deletion of members with signed contracts is refused by design.
- Never reveal a reporter's identity.
- The console refuses writes when it is pointed at the wrong environment.
