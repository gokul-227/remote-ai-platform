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

All landing pages share `app/remote-jobs/Landing.tsx`:

- **Intro text comes from real data only**: `GET /api/v1/jobs/landing-stats` (total live roles, new in
  the last 7 days, top 5 employers, published pay in the most common currency/period: p10, median
  and p90 of the midpoints, shown only with ≥ 3 samples). No numbers are invented.
- **Thin pages**: fewer than `MIN_INDEXABLE_JOBS` (3) roles → `noindex,follow`, and the page is left
  out of the sitemap. Out-of-range or malformed `?page=` → 404.
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
- `sitemap.xml` is an index: `sitemaps/static/0.xml` (home, index, legal, trust, companies hiring),
  `sitemaps/landing/0.xml` (every non-thin landing page, employer pages carry `lastmod` = newest posting),
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

Production only (`APP_ENV=production`); failures are logged and never break an import.

## Google Search Console

The domain property `remoteaiplatform.com` is verified and `https://remoteaiplatform.com/sitemap.xml`
is submitted. The Indexing API service account must be an **Owner** of the property.

The staff console shows a Search Console summary (`search_console_report`: sitemaps, clicks,
impressions, average position, top queries/pages).

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

## Changing things safely

- New landing type: add a spec in `app/remote-jobs/specs.ts`, a route, and a candidate in
  `landingCandidates` (so the sitemap picks it up). Keep the intro data-driven and the thin-page rule.
- New job source: classify it in both `source_policy.py` and `lib/jobSources.ts`.
- Tests: `apps/web/src/lib/landing.test.ts`, `jobPostingJsonLd.test.ts`, `sitemaps.test.ts`,
  `apps/api/tests/test_seo_landing.py`, `test_search_indexing.py`, `test_sitemap_entries.py`,
  `tests/e2e/tests/seo-ssr.spec.ts`.
