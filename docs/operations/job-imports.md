# Job imports runbook

Job imports run only on the production VM's Celery worker (queue `imports`),
scheduled from the `job_sources` table by Beat (`tasks.tick_schedule`, every
minute). GitHub Actions never imports. Source list, terms and estimated volume:
[`docs/product/job-sources.md`](../product/job-sources.md).

## How a run is bounded

| Limit | Setting / place | Value |
|---|---|---|
| Fetch time per run | `JOB_IMPORT_FETCH_BUDGET_SECONDS` | 1,500 s; the adapter stops and checkpoints |
| Task time limit | `jobs.import_source` (`app/worker/tasks.py`) | soft 3,300 s, hard 3,500 s |
| Stale-run requeue | `TaskService.requeue_stale` | 65 min (above the task limit) |
| Broker visibility timeout | `celery_app.py` | 7,200 s |
| Jobs per run (ceiling) | `job_sources.max_per_run` (default `JOB_SYNC_MAX_PER_SOURCE`) | 250,000; migration 077 moved rows still on 10,000 |
| Rows per write | bulk `INSERT … ON CONFLICT` | 500 jobs per statement |

Checkpoints (`job_import_checkpoints.cursor.incremental`) move only after a
successful run:

| Source | Checkpoint | Full catalogue |
|---|---|---|
| ATS boards | `{"offset", "boards"}`: next board in the sorted list | every board once per rotation (6,000 boards per run at most) |
| BUNDESAGENTUR | `{"queue", "page", "sweep_started"}`: partitions still to read | ~7.8k requests per sweep, i.e. 2–3 runs |
| JOBTECH | `{"windows", "sweep_started"}`: date windows still to read | every run (~450 requests) |
| NAV | `{"page", "walk_started", "walk_done_at"}` | full walk once, then new pages; again every 7 days |
| FRANCETRAVAIL | `{"since"}`; not moved when a run could not finish its window | — |

When a sweep completes (Bundesagentur, JobTech, NAV walk), jobs of that source
not seen since the sweep started (allowing `JOB_LAST_SEEN_REFRESH_HOURS`) are
expired. NAV's INACTIVE entries expire their ads at once. To restart a sweep,
clear the source's checkpoint cursor in the console (or set it to `{}`).

## Board discovery

`jobs.discover_boards_scheduled` (Beat, every 6 h at :50 UTC) enqueues
`jobs.discover_boards` (one run per slot). A run:

1. loads the bundled `boards/*.txt` lists into `job_source_boards`;
2. scans stored jobs created since the last run (`job_import_checkpoints`
   row `BOARD_DISCOVERY`, up to `JOB_BOARD_SCAN_ROWS_PER_RUN`) for links to
   Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee, Personio,
   Teamtailor, BambooHR and Breezy boards (every import also records the links
   it parses, before cleaning, so `href`s count);
3. reads `JOB_BOARD_SEED_URLS` (optional public lists; robots.txt checked);
4. validates up to `JOB_BOARD_VALIDATE_PER_RUN` pending candidates with one
   request each, one request per ATS per `JOB_BOARD_HOST_INTERVAL_SECONDS`
   (1 s; robots.txt Crawl-delay wins), all within
   `JOB_BOARD_DISCOVERY_BUDGET_SECONDS`. Live boards are copied to
   `job_source_boards` (`origin` says where they came from); a 404/410 or a
   redirect away from the board `JOB_BOARD_DEAD_AFTER_404S` (3) times, a day
   apart, marks the candidate `not_found`.

Imports also count 404s per live board; three runs in a row retire it.

None of the ten ATSes publishes a public sitemap or company directory (checked
Nov 2026), and the Common Crawl index disallows crawlers in its robots.txt, so
neither is a discovery source. SmartRecruiters' API disallows non-LinkedIn
agents in robots.txt, so its discovered boards are stored but not fetched.

Each run posts to Slack `#job-imports`: new boards found, validated, added
(and the jobs those boards list), dead, live boards and pending candidates.
Failures post a warning to the same channel. Disable with
`JOB_BOARD_DISCOVERY_ENABLED=false`.

Useful queries:

```sql
SELECT source, status, count(*) FROM job_board_candidates GROUP BY 1, 2 ORDER BY 1, 2;
SELECT source, origin, status, count(*), sum(job_count) FROM job_source_boards GROUP BY 1, 2, 3;
```

## Schedules (defaults for new `job_sources` rows; existing rows keep theirs)

| Source | Cron (UTC) |
|---|---|
| GREENHOUSE, LEVER, ASHBY, WORKABLE | `7/27/47 * * * *` |
| BUNDESAGENTUR | `40 */2 * * *` |
| JOBTECH | `25 * * * *` |
| NAV | `10 * * * *` |
| Other sources | see `docs/product/job-sources.md` |
| Board discovery | `50 */6 * * *` (Beat) |

## Sources that need a decision (not enabled here)

| Source | What it needs |
|---|---|
| WORKDAY | Confirmation that reading each employer's public Workday career site is acceptable (no published third-party terms); then `permission_confirmed=true` and `WORKDAY_SITES`/list. |
| REMOTE_RSS | Each feed's terms read and accepted (NoDesk, Real Work From Anywhere, Remote First Jobs); then `permission_confirmed=true`. |
| ADZUNA | A commercial licence from Adzuna (`ADZUNA_LICENSE_CONFIRMED=true`) plus `ADZUNA_APP_ID`/`ADZUNA_APP_KEY` in Infisical. |
| WORKINGNOMADS | Written redistribution permission (`WORKINGNOMADS_PERMISSION_CONFIRMED=true`). |
| FRANCETRAVAIL | Free partner account: `FRANCE_TRAVAIL_CLIENT_ID`/`FRANCE_TRAVAIL_CLIENT_SECRET`. Busy windows are read per département (one query reaches 3,150 results). |
| USAJOBS | `USAJOBS_AUTH_KEY`; up to `USAJOBS_MAX_PAGES` (100) pages per run. |
| CAREERJET | Affiliate `CAREERJET_API_KEY`; up to `CAREERJET_MAX_PAGES` (20) per locale. |

Attribution: every listing links to the original posting. JobTech data is CC0;
NAV and Bundesagentur listings link to arbeidsplassen.no / arbeitsagentur.de.

## When something goes wrong

* A failed run posts to `#job-imports`; the checkpoint is unchanged, so the next
  slot retries the same work.
* A run that hits the hard time limit is retried by Celery; lower
  `JOB_IMPORT_FETCH_BUDGET_SECONDS` if saving regularly takes more than ~30 min.
* A source answering 429/5xx: pause it in the console or raise its cron gap.
