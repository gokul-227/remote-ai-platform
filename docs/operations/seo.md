# Search visibility (SEO) operations

What the platform does to be crawled, indexed and ranked, how to watch it in Google Search
Console, and what to check every week. No one can guarantee rankings. Everything below is
what search engines document as helping a site get discovered and understood. Do not add copy that
promises a ranking.

## What exists

### Public, server-rendered pages (`apps/web/src/app`)

| Page | Path | Notes |
| --- | --- | --- |
| Home | `/` | Organization + WebSite JSON-LD (with `SearchAction` → `/remote-jobs?q=`) |
| Job index | `/remote-jobs` | Categories, places, companies link, search form, paginated latest jobs (`?page=N`); `?q=` results are `noindex,follow` |
| Category | `/remote-jobs/<topic>` | 40 role/skill/way-of-working topics (`lib/seo.ts` `TOPICS`) |
| Location | `/remote-jobs/in/<place>` | 27 places (`PLACES`): countries, regions, worldwide |
| Role × location | `/remote-jobs/<topic>/in/<place>` | every topic × place |
| Role × skill | `/remote-jobs/<role>/<skill>` | 11 roles × 8 skills (`lib/landing.ts` `ROLES`, `SKILLS`) |
| Companies hiring | `/remote-jobs/at` | employers with ≥ 3 live remote jobs |
| Employer | `/remote-jobs/at/<employer-slug>` | one employer's live remote jobs |
| Job | `/jobs/<id>` | JobPosting JSON-LD, breadcrumbs, more jobs at the employer, related jobs, category/place links |
| Company / person / post | `/companies/<id>`, `/people/<id>`, `/posts/<id>` | Organization / ProfilePage / post JSON-LD + breadcrumbs |
| Trust, legal | `/trust`, `/privacy`, `/terms`, `/impressum` | `/status` is `noindex` |
| Guides | `/guides`, `/guides/<slug>` | evergreen guides (`lib/guides.ts`): finding a remote job, salary by role/seniority, location/time-zone/visa rules. Author = the site (Article JSON-LD, `Organization` author); every figure is read live from `landing-stats` |
| HTML site map | `/sitemap` | every category, location, role × skill, the first 12 places × every category, employers, guides; linked from every footer |

Hub and spoke: home and the footer → `/remote-jobs` → categories / locations / employers → combinations
→ jobs; job pages link back up (breadcrumb includes the job's main category) and sideways (same
employer, related jobs, category/place chips). Guides link into the hubs.

`/remote-jobs?q=<term>` where the term is exactly a keyword category (slug, name or query, e.g.
`?q=Python`) answers **308 → `/remote-jobs/<slug>`**, so a search never competes with its landing page.
Other searches stay `noindex,follow` with canonical `/remote-jobs`. No `hreflang`: the site is English only.

All landing pages share `app/remote-jobs/Landing.tsx`:

- **Intro text comes from real data only**: `GET /api/v1/jobs/landing-stats` (total live roles, new in
  the last 7 days, top 5 employers, published pay in the most common currency/period: p10, median
  and p90 of the midpoints, shown only with ≥ 3 samples). No numbers are invented.
- **At a glance** (page 1, `LandingInsights.tsx`): published pay by seniority (same currency/period,
  ≥ 3 listings per level), the 10 skills most often listed (linked to their category when one
  exists), employers with most openings (linked to their employer page), and new listings per week
  for the last four weeks. Sections without enough data are omitted. The API caches each
  `landing-stats` answer in Redis for 30 minutes (`SEO_CACHE_TTL`; keyword aggregates can take tens of seconds cold).
- **Thin pages**: a *known* count below `MIN_INDEXABLE_JOBS` (3) → `noindex,follow`, and the page is left
  out of the sitemap. When `landing-stats` times out, the job list's `X-Total-Count` is used; if both
  fail the count is unknown and the page stays indexable (an outage must never noindex the site:
  in Nov 2026 a slow aggregate made every keyword landing page answer `noindex` with "(0)" in its
  title). Out-of-range or malformed `?page=` → 404.
- **Pagination**: real `<a href rel="prev/next">` links, 50 jobs a page; each page is self-canonical.
- **Breadcrumbs**: visible trail + `BreadcrumbList` JSON-LD; `ItemList` of the jobs on the page.
- **Related links**: sibling categories, the same role in other places, role × skill pairs, other employers.

### Job structured data (`lib/site.ts` `jobPostingJsonLd`)

`title`, `description`, `identifier`, `datePosted`, `validThrough` (posted + 90 days),
`hiringOrganization` (+ `sameAs` for companies with a page), `employmentType`, `directApply`
(true only for jobs posted on the platform), `baseSalary` only when amount, currency **and**
period are known, `skills`. Remote jobs: `jobLocationType: TELECOMMUTE` plus
`applicantLocationRequirements` **only** for countries the posting names (`inferCountries`); no
worldwide eligibility is invented. On-site jobs: `jobLocation` with `addressCountry` when unambiguous.
JobPosting is emitted only for sources that allow Google for Jobs (`lib/jobSources.ts`, mirrors
`apps/api/app/domains/jobs/source_policy.py`); other sources' job pages are `noindex,follow`.

### Status codes

- Unknown pages and unknown job ids: 404.
- Recently expired jobs (≤ `JOB_GONE_AFTER_DAYS`, 30 days): 200 with a "no longer available" notice,
  `noindex,follow`, no JobPosting.
- Long-gone jobs (removed, hidden, expired > 30 days ago, or posted > 120 days ago): **410 Gone**, from
  `apps/web/src/proxy.ts` via `GET /api/v1/jobs/{id}/availability`. It fails open (normal page) if the
  API is slow.
- `www.` → apex and `http` → `https`: 301 at Cloudflare. Hash URLs (`/#jobdetail/<id>`) are app
  routes; crawlers never see them, since every public link is a real path.

### Sitemaps and robots

- `robots.txt`: allow all in production only, with `Sitemap: https://remoteaiplatform.com/sitemap.xml`.
- `sitemap.xml` is an index: `sitemaps/static/0.xml` (home, index, legal, trust, companies hiring,
  guides, `/sitemap`), `sitemaps/landing/0.xml` (employer pages from the employer list with `lastmod` =
  newest posting; category and place hubs unless known thin; combinations only when known to have ≥ 3
  roles; stats lookups share a 40 s budget so the file always answers — it used to time out),
  Shards (`sitemaps/<kind>/<n>.xml`) are ISR (`revalidate = 900`): generated on first request, then
  served from the web server's cache in milliseconds and regenerated in the background; a failed
  regeneration keeps the last good copy (the first-ever failure answers 500). `/remote-jobs` lists every
  page of the full job list, so any live job is at most three clicks from the home page.
  and `sitemaps/{jobs,people,companies,posts}/<n>.xml` in 5,000-URL chunks. The jobs sitemap covers every
  live, syndication-eligible job posted in the last `SITEMAP_JOB_MAX_AGE_DAYS` (90), with `lastmod`.

### Indexing notifications (`apps/api/app/services/search/indexing.py`)

After each import run:

- **Google Indexing API** (`GOOGLE_INDEXING_CREDENTIALS_B64`): `URL_UPDATED` for new jobs, then
  `URL_DELETED` for expired ones. It uses one shared daily budget (`GOOGLE_INDEXING_DAILY_QUOTA`, counted in Redis)
  and a per-run cap (`GOOGLE_INDEXING_PER_RUN`). New jobs are filtered to **indexable** ones (allowed source,
  inside the sitemap window) and sorted **newest posting first** (`JobRepository.indexable_newest_first`),
  so the budget goes to the freshest pages and none is spent on noindex pages. Deletions are sent only
  for syndicated sources.
- **IndexNow** (Bing, Yandex, Seznam, Naver): every new and removed URL; the key is served at `/indexnow.txt`.
- **Catch-up sweep** (`seo.indexing_sweep`, Beat every 4 h at :25, `SEO_INDEXING_SWEEP_ENABLED`): indexable
  jobs posted in the last 48 h that no run has announced (per-run cap or quota hit) go to Google, newest
  first, within the same daily budget. Google-accepted URLs are remembered for 7 days in a Redis sorted
  set (`indexing:google:announced`); without Redis the sweep sends nothing.

Production only (`APP_ENV=production`); failures are logged and never break an import.

## Google Search Console

The domain property `remoteaiplatform.com` is verified and `https://remoteaiplatform.com/sitemap.xml`
is submitted. The Indexing API service account must be an **Owner** of the property.

The staff console shows a Search Console summary (`search_console_report`: sitemaps, clicks,
impressions, average position, top queries/pages).

### Weekly Slack summary

`ops.seo_weekly_report` (Beat, Mondays 07:30 UTC) posts last week's clicks and impressions (with the
change against the week before), average position, top 5 queries, top 3 pages and sitemap
submitted/indexed/errors to `#seo` (`SLACK_CHANNEL_SEO`), or `#signups` when that is empty. Off until
`SEO_WEEKLY_REPORT_ENABLED=true` (Infisical). Search Console data lags about 3 days, so the window ends 3
days ago. A failed call posts one warning a week.

**Granting access** (owner, once): it reuses `GOOGLE_INDEXING_CREDENTIALS_B64` with the read-only
`webmasters.readonly` scope. In Search Console → Settings → Users and permissions, the service account's
`client_email` must be a user of the `remoteaiplatform.com` domain property (Owner is already required
for the Indexing API; "Full" or "Restricted" is enough for reading). In Google Cloud, enable the
**Google Search Console API** for the service account's project. Then set
`SEO_WEEKLY_REPORT_ENABLED=true` and, optionally, create `#seo`, invite the bot and set `SLACK_CHANNEL_SEO`.

## Speed and caching

Measured with Lighthouse 12 (mobile, simulated throttling). The biggest problem was TTFB: keyword
landing pages waited up to 45 s for `landing-stats`.

- **Edge caching** (`infra/docker/Caddyfile`, `@public_html`): public SSR pages (`/`, `/remote-jobs*`,
  `/jobs/*`, `/guides*`, `/sitemap`, company/person/post pages, legal) get
  `Cache-Control: public, max-age=0, s-maxage=600, stale-while-revalidate=86400, stale-if-error=86400`
  (and the same in `Cloudflare-CDN-Cache-Control`). RSC requests (`Rsc` header or `_rsc` query) keep
  Next's `private, no-store`. The HTML is the same for every visitor (sign-in is client-side), so a shared
  cache is safe. Sitemaps send `s-maxage=3600`.
- **Cloudflare Cache Rule (owner, once)**: Cloudflare does not cache HTML by default. Caching → Cache
  Rules → "Cache public HTML": hostname equals `remoteaiplatform.com` AND URI path matches the list above
  (or starts with `/remote-jobs`, `/jobs/`, `/guides`) AND query string does not contain `_rsc` → *Eligible
  for cache*, Edge TTL "Use cache-control header if present", Browser TTL "Respect origin". Check with
  `curl -sI https://remoteaiplatform.com/remote-jobs/python | grep -i cf-cache-status` (expect `HIT` on the
  second request).
- **Client JS**: public pages render the auth provider from the root layout; it now loads the Supabase
  client and axios only on sign-out, cutting gzipped JS on every public page from ~257 KB to ~176 KB.

## Weekly checks (about 15 minutes)

1. **Sitemaps** (Indexing → Sitemaps): `sitemap.xml` status "Success", read in the last few days;
   submitted vs indexed is not falling. Fetch `https://remoteaiplatform.com/sitemap.xml` and confirm
   `sitemaps/landing/0.xml` and the jobs chunks answer 200.
2. **Pages** (Indexing → Pages): look at the "Why pages aren't indexed" reasons. Expect "Excluded by
   noindex" (thin landing pages, restricted sources, search results) and "Not found (404)/410" for
   removed jobs. Investigate any rise in "Server error (5xx)", "Soft 404", "Duplicate without
   user-selected canonical" or "Crawled – currently not indexed" on landing pages.
3. **Job postings** (Enhancements → Job postings): errors must be 0. Warnings for missing
   `baseSalary` or `applicantLocationRequirements` are expected where the source doesn't publish them;
   we do not fill them with guesses.
4. **Breadcrumbs / Sitelinks search box**: no errors.
5. **Core Web Vitals** (Experience): no "Poor" URL groups on mobile. Run Lighthouse on `/remote-jobs/python`
   and a job page after big UI changes.
6. **Performance**: compare clicks, impressions and average position with the previous 28 days; note
   new top queries/pages. If a landing type gets impressions but few clicks, improve its title/intro
   from real data. Don't add keyword lists.
7. **Indexing API**: in the API logs, `Search engines notified:` lines appear after imports; Google quota
   errors (429) mean the daily budget was reached (the sitemap still covers everything).
8. **URL Inspection** on one new job page: "URL is on Google" or "Discovered", with JobPosting detected.
9. **Landing pages are indexable**: `curl -s https://remoteaiplatform.com/remote-jobs/python | grep -o
   '<meta name="robots"[^>]*>'` prints nothing, and the title has a real count. Fetch
   `sitemaps/landing/0.xml` and confirm it answers within a minute with hundreds of `<loc>` entries.
10. **Edge cache**: `cf-cache-status: HIT` on a repeated landing-page request.

### Slack-ready weekly checklist (paste into #seo)

```text
SEO weekly check – <date>
[ ] Weekly Search Console summary arrived (clicks/impressions vs last week)
[ ] Sitemaps: Success, read in last few days, landing sitemap answers
[ ] Pages report: no rise in 5xx / soft 404 / duplicate canonical
[ ] Job postings enhancement: 0 errors
[ ] Core Web Vitals: no Poor URL groups on mobile
[ ] /remote-jobs/python not noindex, title count > 0
[ ] cf-cache-status HIT on a landing page
[ ] One new job page inspected: on Google / JobPosting detected
```

### Google for Jobs eligibility (per job page)

JobPosting JSON-LD is emitted only when all hold: the source allows syndication (`lib/jobSources.ts` ↔
`source_policy.py`), the job is live (not expired), and the page is indexable. Required fields (`title`,
`description`, `datePosted`, `hiringOrganization.name`, and `jobLocation` or `jobLocationType:
TELECOMMUTE`) are always present; `validThrough`, `employmentType`, `baseSalary` and
`applicantLocationRequirements` only when the listing states them. `src/lib/structuredData.test.ts`
validates every JSON-LD type the site emits (JobPosting, BreadcrumbList, Article, Organization, WebSite).
Expired jobs drop the JSON-LD at once, answer 410 after 30 days, and are sent to Google as `URL_DELETED`.

## Changing things safely

- New landing type: add a spec in `app/remote-jobs/specs.ts`, a route, and a candidate in
  `landingCandidates` (so the sitemap picks it up). Keep the intro data-driven and the thin-page rule.
- New job source: classify it in both `source_policy.py` and `lib/jobSources.ts`.
- New guide: add it to `GUIDES` in `lib/guides.ts` and a body in `app/guides/[slug]/page.tsx`; use only
  live aggregates for figures and keep the author the site.
- Tests: `apps/web/src/lib/landing.test.ts`, `jobPostingJsonLd.test.ts`, `sitemaps.test.ts`,
  `structuredData.test.ts`, `seoRank.test.ts`,
  `apps/api/tests/test_seo_landing.py`, `test_search_indexing.py`, `test_sitemap_entries.py`, `test_seo_rank.py`,
  `tests/e2e/tests/seo-ssr.spec.ts`.
