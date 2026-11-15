# Job ingestion and sources

Imports run only on the Celery worker on the production VM. Beat's `tick_schedule` reads the `job_sources`
table every minute (enabled, cron, `max_per_run`, rate limit, `permission_confirmed`) and enqueues one
idempotent run per source and cron slot. Staff operate sources from **Job sources** and **Background
processing**; failures post to `#job-imports`.

## Sources and terms

Every job links to its original posting; the original apply URL is kept unchanged.

| Source | Key needed | Terms that shape the code |
| --- | --- | --- |
| Remote OK | no | Named attribution and backlink; no logo without permission |
| Arbeitnow | no | Public job-board API; keep attribution |
| Remotive | no | Attributed display; at most 4 fetches/day; no Google Jobs syndication; no sign-up gate |
| Jobicy | no | Commercial boards allowed; apply URL stays the Jobicy URL |
| Himalayas | no | Attributed display; unchanged application link; no Google Jobs syndication; cursor pagination |
| Working Nomads | permission flag | Terms forbid competing products: off unless `WORKINGNOMADS_PERMISSION_CONFIRMED` |
| The Muse | `THEMUSE_API_KEY` | Production use needs a registered app; disabled without a key |
| USAJOBS | `USAJOBS_AUTH_KEY` | Issued credentials and use limits |
| Adzuna | keys + licence flag | Free tier is evaluation only: off unless `ADZUNA_LICENSE_CONFIRMED` |
| Jooble | `JOOBLE_API_KEY` | Account quota |
| Greenhouse, Lever, Ashby, SmartRecruiters, Workable | company lists in settings | Public career-site APIs; employer redistribution rights unconfirmed |
| Hacker News "Who is hiring" | no | Keep the original post link |

Remotive, Himalayas, Working Nomads and Adzuna are excluded from sitemaps, structured data and search-engine
notifications regardless of flags.

## Behaviour

- A failed fetch is never recorded as an empty success and never expires that source's jobs.
- Explicit `remote=false` / onsite flags beat heuristics; a missing location shows as unspecified.
- Cross-source de-duplication (`JOB_DEDUP_ACROSS_SOURCES`).
- Retention: jobs unseen for `JOB_UNSEEN_EXPIRY_DAYS` (30) leave the public list; imported jobs older than
  `JOB_RETENTION_DAYS` (90) are deleted, or hidden if someone applied; `maintain_catalogue` (03:20 UTC)
  keeps the database under `DATABASE_SIZE_BUDGET_MB`, removing the oldest unapplied imports first.
- After each import, eligible new pages are announced to Google (Indexing API, daily quota) and IndexNow.
- Checkpoints per source in `job_import_checkpoints` (last success, error category, consecutive failures).

## Open items

Closed-job reconciliation via Jobicy/Himalayas status endpoints; employer permission review for ATS boards
before Google Jobs syndication.
