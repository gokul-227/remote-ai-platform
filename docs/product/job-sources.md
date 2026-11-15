# Job sources: coverage, cadence and capacity

Imported jobs come only from legal, free (or free-key) sources, are kept only
while they were **posted in the last 90 days** (`JOB_RETENTION_DAYS`), and always
link to the original posting. No GitHub-hosted job lists are used; GitHub
Actions only deploys. Everything is operated from the staff console
(`/admin/background/sources`): enable/disable, cron cadence, per-run cap,
rate limit, permission, company boards and board validation.

## Sources

| Source (`job_sources.name`) | Kind | Key / setting | Default cron (UTC) | Incremental | Notes |
|---|---|---|---|---|---|
| GREENHOUSE, LEVER, ASHBY, WORKABLE | ATS company boards | none | `7/27/47 * * * *` (new rows), existing rows keep theirs | board rotation checkpoint | bundled lists in `aggregators/boards/*.txt` |
| SMARTRECRUITERS | ATS | none | 3-hourly | rotation | `api.smartrecruiters.com/robots.txt` disallows all agents but LinkedInBot, so the robots check keeps it off |
| RECRUITEE, PERSONIO, TEAMTAILOR, BAMBOOHR, BREEZY, RIPPLING | ATS (new) | none | 3-hourly | rotation | per-company subdomains, robots.txt checked per company |
| WORKDAY | ATS (new) | `WORKDAY_SITES` (+ list) | `30 4 * * *` | rotation | **starts paused** (`permission_confirmed=false`): no published third-party terms |
| BUNDESAGENTUR | Germany, Bundesagentur für Arbeit Jobsuche | `BUNDESAGENTUR_API_KEY` (public client id, defaulted) | `40 */2 * * *` | `veroeffentlichtseit` days since last run | ≤ `BUNDESAGENTUR_MAX_PAGES`×100 per run |
| JOBTECH | Sweden, Arbetsförmedlingen open data (CC0) | none | `25 * * * *` | `published-after` | offset ≤ 2000 per query |
| NAV | Norway, arbeidsplassen.no feed | `NAV_FEED_TOKEN` optional (public token endpoint otherwise) | `10 * * * *` | feed page id | starts at the newest page (no back-fill) |
| FRANCETRAVAIL | France Travail Offres d'emploi v2 | `FRANCE_TRAVAIL_CLIENT_ID`, `FRANCE_TRAVAIL_CLIENT_SECRET` | `50 */3 * * *` | `minCreationDate` | free partner account |
| ADZUNA | 19 countries (`ADZUNA_COUNTRIES`) | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `ADZUNA_LICENSE_CONFIRMED=true` | `5 */6 * * *` | `max_days_old` | needs a commercial licence for production |
| JOOBLE | aggregator | `JOOBLE_API_KEY` | `0 6 * * *` | — | small lifetime request budget per key |
| CAREERJET | aggregator, 10 locales | `CAREERJET_API_KEY` (affiliate) | `35 */6 * * *` | date-sorted pages | keep Careerjet tracking URL as the apply link |
| USAJOBS | US federal | `USAJOBS_AUTH_KEY` | `15 */6 * * *` | — | remote/telework only |
| GETONBOARD | Latin America tech board API | none | `45 */6 * * *` | newest-first pages | |
| REMOTE_RSS | NoDesk, Real Work From Anywhere, Remote First Jobs RSS (`REMOTE_RSS_FEEDS`) | none | `55 */4 * * *` | — | **starts paused** until each board's terms are confirmed |
| REMOTIVE, REMOTEOK, ARBEITNOW, JOBICY, HIMALAYAS, WEWORKREMOTELY, THEMUSE, HACKERNEWS, WORKINGNOMADS | remote boards (existing) | as before | as before | — | unchanged |

Considered and **not** added: JazzHR (public XML export retired, HTTP 410),
Landing.jobs (robots.txt disallows `/api/`), Authentic Jobs (robots.txt
disallows `/feed/`), Jobspresso (robots.txt disallows the query URL its job
feed needs), Job Bank Canada open data (monthly UTF-16 CSV with no employer
name and no posting URL, so a listing could not link to the job), EURES (no
public API without a partner agreement).

## Company boards

* Bundled lists: `apps/api/app/domains/jobs/aggregators/boards/<ats>.txt`, one
  token per line, built from employer career links in the public Hacker News
  "Who is hiring?" threads (Algolia HN API, 2016–2026) plus the lists that were
  in settings, then checked once (one polite GET per board, robots.txt
  respected) when the list was built. Extra tokens can be added with the
  matching setting (`GREENHOUSE_BOARDS`, `RECRUITEE_COMPANIES`, …).
* The lists are loaded into `job_source_boards` (migration 075) when staff open
  the sources page. Imports fetch enabled boards whose status is not
  `not_found` or `robots_blocked`.
* **Validation** is staff-run only ("Validate boards" in the console →
  `jobs.validate_boards` task, or `python -m app.domains.jobs.board_validation
  GREENHOUSE 200`). It checks unchecked boards first, one at a time, pausing
  `60 / rate_limit_per_minute` seconds between boards, and records
  `ok / empty / not_found / robots_blocked / error` and the job count. It never
  runs during an import.
* Long lists rotate: each run takes `ATS_BOARDS_PER_RUN` (300) boards from the
  offset stored in the import checkpoint, so a hourly source refreshes 7,200
  boards a day. A board seen by no run for `JOB_UNSEEN_EXPIRY_DAYS` (30) leaves
  the list.

## Politeness

* User agent `JOB_SOURCE_USER_AGENT`; robots.txt read per host and cached for
  24 h (`JOB_SOURCE_RESPECT_ROBOTS`): 4xx = no rules, 5xx/unreachable = treat as
  disallowed. A source whose every board is disallowed reports DISABLED.
* `ATS_BOARD_CONCURRENCY` (3) requests at once per source, a
  `JOB_SOURCE_REQUEST_DELAY_SECONDS` (0.25 s) pause before each.
* Government APIs are read sequentially, page by page, with the page caps above.

## Retention and listings

* Imported jobs posted more than 90 days ago are excluded from listings and
  search at once (repository filter) and deleted by the nightly
  `jobs.maintain_catalogue` task (hidden instead when someone applied/saved).
* Sitemaps list only jobs posted within `SITEMAP_JOB_MAX_AGE_DAYS` (90) and
  never sources blocked from syndication.
* Jobs older than the window are dropped before storage, so back-fills do not
  churn the database.

## Throughput and capacity (one Oracle VM: 4 OCPU, 22 GB RAM, ~160 GB disk)

* Worker: `--concurrency 4` on `default,imports` (2 CPUs / 2 GB limit); imports
  are I/O bound. PostgreSQL bulk upsert writes 500 jobs per statement.
* `DATABASE_SIZE_BUDGET_MB` is set to 60000 for the VM in
  `docker-compose.prod.yml` (the 420 MB default was for the free hosted
  database and would trim the catalogue to ~100k jobs).
* Row size with descriptions capped at 5,000 characters plus indexes is
  ~4–6 KB, so 1M jobs ≈ 5–6 GB and 3M ≈ 15–18 GB.

### Reachable volume (90-day window, estimates)

| Group | Active jobs reachable | Basis |
|---|---|---|
| ATS boards (bundled lists: 1,516 boards that answered on 2026-11-15, plus 46 SmartRecruiters and 171 Workday tokens kept but not fetched) | 40k–70k | Greenhouse ≈ 450 boards × ~60, Ashby ≈ 385 × ~25, Lever ≈ 250 × ~30, Workable ≈ 200 × ~10, smaller ATSes |
| Bundesagentur (keyless) | 500k–900k | ~1M listed; ~7.5k new per day; capacity 5k per run × 12 runs/day |
| JobTech (keyless) | 40k–50k | Sweden's whole open job stream |
| NAV (keyless) | 15k–25k after ~60 days | forward-only feed |
| Remote boards (existing + Get on Board) | 15k–25k | |
| **Keyless total** | **~0.6M–1.1M** | |
| France Travail (free key) | +500k–900k | ~20k new/day; capacity 3k per run × 8 |
| Adzuna, Careerjet, Jooble, USAJobs (keys/licence) | +100k–300k | page caps per run |
| **With keys** | **~1.2M–2.3M** | |

Growing further means more ATS boards (validate more tokens, raise
`ATS_BOARDS_PER_RUN` or cadence), more government feeds, or raising page caps;
the database budget and worker concurrency above leave headroom for ~3M jobs.
