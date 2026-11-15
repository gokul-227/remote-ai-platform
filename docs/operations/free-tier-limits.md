# Free-tier limits and costs

Target cost: zero. Every provider runs on a free tier; a card on file is acceptable where a free tier
requires one. Allowances below were read from the providers' pages in November 2026 — re-check before
relying on them. `cost_guard` (every 6 h) posts to `#costs` at 70 % and 90 %.

| Provider | Use | Free allowance (Nov 2026) | Guard in the product |
| --- | --- | --- | --- |
| Oracle Cloud Always Free | VM (A1 arm64), block volume, Object Storage | A1 up to 4 OCPU / 24 GB; 200 GB block total; 20 GB object storage; 10 TB egress/month. Idle A1 instances can be reclaimed after 7 days below 20 % CPU/network/memory. | `COST_DISK_PATH`, `COST_STORAGE_LIMIT_GB` (20), `COST_DB_LIMIT_MB` |
| Cloudflare | DNS, proxy, TLS at edge | Free plan | none needed |
| Brevo | Transactional email | 300 emails/day | `COST_EMAIL_DAILY_LIMIT`, `COST_EMAIL_MONTHLY_LIMIT` |
| WorkOS AuthKit | Sign-in | 1M MAU free (enterprise SSO is paid; not used) | — |
| AI providers (Groq, Gemini, OpenRouter, Cerebras, Mistral) | LiteLLM chain | Provider free tiers, rate-limited | Per-user `AI_FREE_MONTHLY_TOKENS`, platform `AI_GLOBAL_DAILY_TOKENS` |
| GitHub | Code, CI, GHCR | Free for public repositories | — |
| Infisical | Secrets | Free plan | — |
| Slack | Alerts | Free workspace (90-day history) | rate limit per channel |
| GlitchTip, Uptime Kuma | Self-hosted on the VM | VM resources only | — |
| UptimeRobot | Off-VM uptime | 50 monitors, 5-minute interval | — |

## Other caps in code

Upload size and per-user storage quota (`FILES_MAX_UPLOAD_MB`, `FILES_USER_QUOTA_MB`), import per-run caps
(`JOB_SYNC_MAX_PER_SOURCE`), job catalogue size budget (`DATABASE_SIZE_BUDGET_MB`, oldest unapplied
imported jobs make room), push per user per hour, contact invites per day, Google Indexing quota.

## Single-VM risk

No failover. Mitigations: nightly off-host backups, documented rebuild path in the
[incident runbook](incident-runbook.md), workloads that keep the VM above the idle-reclaim threshold.
