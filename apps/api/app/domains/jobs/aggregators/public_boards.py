"""
Public job sources that need no API key: remote-job boards and company career
boards hosted on common applicant-tracking systems (ATS).

Every adapter keeps the original posting URL in `external_url`, so the product
always links back to the source (attribution, and applicants apply where the
employer receives applications). Company lists are configurable
(GREENHOUSE_BOARDS, LEVER_BOARDS, ASHBY_BOARDS, SMARTRECRUITERS_COMPANIES) and
default to large employers whose public boards were verified live.
"""

import asyncio
import html
import re
from datetime import UTC, datetime

import httpx

from app.core.config import settings
from app.domains.jobs.aggregators import robots
from app.domains.jobs.aggregators.base import (
    BaseAggregator,
    SourceDisabledError,
    SourceFetchError,
    parse_posted_at,
    require_list,
)
from app.domains.jobs.aggregators.board_lists import configured_boards
from app.domains.jobs.schemas import JobPostCreate

TIMEOUT = httpx.Timeout(20.0)
REMOTE_WORDS = ("remote", "anywhere", "distributed", "worldwide", "work from home")


def _remote(*parts: str | None) -> bool:
    text = " ".join(p for p in parts if p).lower()
    return any(w in text for w in REMOTE_WORDS)


def _boards(raw: str) -> list[str]:
    return [b.strip() for b in raw.split(",") if b.strip()]


def _shard(boards: list[str], now: datetime | None = None) -> list[str]:
    """This run's group of company boards: the groups rotate every 3 hours, so each
    company is fetched in full twice a day without one run doing all of them."""
    shards = max(1, settings.ATS_BOARD_SHARDS)
    hour = (now or datetime.now(UTC)).hour
    current = (hour // 3) % shards
    return [b for i, b in enumerate(sorted(boards)) if i % shards == current]


def _workplace(value: object) -> str | None:
    """A board's structured workplace type (Lever/Ashby workplaceType)."""
    key = str(value or "").lower().replace("-", "").replace("_", "").replace(" ", "")
    return {"remote": "remote", "hybrid": "hybrid", "onsite": "onsite", "inoffice": "onsite"}.get(key)


class _Board(BaseAggregator):
    """Shared helpers: build a job, fetch many company boards concurrently."""

    # URL of one board's feed ("{board}" is replaced); used for robots.txt checks.
    board_url: str = ""

    def board_tokens(self) -> list[str]:
        """This source's company boards: staff-managed rows when loaded, else the
        bundled data file + setting."""
        if self.boards is not None:
            return list(self.boards)
        return configured_boards(self.source_name)

    def pick_boards(self, boards: list[str]) -> list[str]:
        """This run's boards. Short lists keep the 3-hourly shard rotation; long
        lists (thousands of companies) are walked ATS_BOARDS_PER_RUN at a time from
        the checkpoint offset, so every board is refreshed once per full cycle
        within the VM's request budget."""
        per_run = max(1, settings.ATS_BOARDS_PER_RUN)
        ordered = sorted(boards, key=str.lower)
        if len(ordered) <= per_run:
            return _shard(ordered)
        offset = int(self.cursor.get("offset", 0) or 0) % len(ordered)
        batch = ordered[offset : offset + per_run]
        if len(batch) < per_run:
            batch += ordered[: per_run - len(batch)]
        self.next_cursor = {"offset": (offset + per_run) % len(ordered), "boards": len(ordered)}
        return batch

    def _job(
        self,
        *,
        ext_id: str,
        title: str,
        company: str,
        url: str | None,
        description: str,
        location: str | None,
        job_type: str | None = None,
        remote: bool | None = None,
        salary: tuple[float | None, float | None, str | None] = (None, None, None),
        tags: list[str] | None = None,
        posted_at: object = None,
        workplace: str | None = None,
    ) -> JobPostCreate | None:
        title = self.clean_text(title)
        if not title:
            return None
        description = (self.clean_rich_text(description) or title)[
            : settings.JOB_DESCRIPTION_MAX_CHARS
        ]
        location = self.clean_text(location) or "Not specified"
        low, high, currency = salary
        # Column limits (VARCHAR 255): multi-city locations can be far longer.
        return JobPostCreate(
            title=title[:255],
            description=description,
            company_name=(self.clean_text(company) or "Unknown Company")[:255],
            location=location if len(location) <= 255 else location[:252].rsplit(",", 1)[0] + "…",
            is_remote=_remote(location, title) if remote is None else remote,
            job_type=self.normalize_job_type(job_type),
            skills=self.extract_skills(f"{title} {' '.join(tags or [])} {description}"),
            external_id=f"{self.source_name.lower()}_{ext_id}"[:255],
            external_url=url,
            source=self.source_name,
            salary_min=low,
            salary_max=high,
            salary_period="year" if low or high else None,
            currency=(currency or "USD")[:3],
            posted_at=parse_posted_at(posted_at),
            workplace_type=_workplace(workplace),
        )

    async def _many(self, boards: list[str], fetch, limit: int) -> list[JobPostCreate]:
        """Fetch boards concurrently; one bad board never fails the whole source."""
        # Few boards in memory at once (small instances), and a polite pause per request.
        sem = asyncio.Semaphore(max(1, settings.ATS_BOARD_CONCURRENCY))
        answered = blocked = 0
        async with httpx.AsyncClient(
            timeout=TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": robots.user_agent()},
        ) as client:

            async def one(board: str) -> list[JobPostCreate]:
                async with sem:
                    try:
                        nonlocal answered, blocked
                        if self.board_url and not await robots.allowed(
                            client, self.board_url.format(board=board)
                        ):
                            blocked += 1
                            return []
                        if settings.JOB_SOURCE_REQUEST_DELAY_SECONDS > 0:
                            await asyncio.sleep(settings.JOB_SOURCE_REQUEST_DELAY_SECONDS)
                        result = await fetch(client, board)
                        answered += 1
                        return result
                    except Exception:
                        return []

            results = await asyncio.gather(*(one(b) for b in boards))
        if boards and blocked == len(boards):
            raise SourceDisabledError("robots.txt disallows this source's feed")
        if boards and not answered:
            raise SourceFetchError("no board answered")
        # Interleave boards so the per-run limit is shared fairly between companies.
        jobs: list[JobPostCreate] = []
        for i in range(max((len(r) for r in results), default=0)):
            for r in results:
                if i < len(r):
                    jobs.append(r[i])
        return jobs[:limit]


class GreenhouseAggregator(_Board):
    source_name = "GREENHOUSE"
    # Public Job Board API (docs.greenhouse.io/job-board): unauthenticated GET for career sites.
    board_url = "https://boards-api.greenhouse.io/v1/boards/{board}/jobs"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        async def fetch(client: httpx.AsyncClient, board: str) -> list[JobPostCreate]:
            r = await client.get(
                f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs",
                params={"content": "true"},
            )
            r.raise_for_status()
            company = board.replace("-", " ").title()
            out = []
            for it in require_list(r.json(), "jobs"):
                job = self._job(
                    ext_id=f"{board}_{it.get('id')}",
                    title=it.get("title", ""),
                    company=company,
                    url=it.get("absolute_url"),
                    description=html.unescape(it.get("content") or ""),
                    location=(it.get("location") or {}).get("name"),
                    posted_at=it.get("first_published") or it.get("updated_at"),
                )
                if job:
                    out.append(job)
            return out

        return await self._many(self.pick_boards(self.board_tokens()), fetch, limit)


class LeverAggregator(_Board):
    source_name = "LEVER"
    # Lever postings API (public, no key) for employer job sites.
    board_url = "https://api.lever.co/v0/postings/{board}"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        async def fetch(client: httpx.AsyncClient, board: str) -> list[JobPostCreate]:
            r = await client.get(
                f"https://api.lever.co/v0/postings/{board}", params={"mode": "json"}
            )
            r.raise_for_status()
            out = []
            for it in require_list(r.json()):
                cat = it.get("categories") or {}
                job = self._job(
                    ext_id=f"{board}_{it.get('id')}",
                    title=it.get("text", ""),
                    company=board.title(),
                    url=it.get("hostedUrl"),
                    description=it.get("descriptionPlain") or it.get("description") or "",
                    location=cat.get("location"),
                    job_type=cat.get("commitment"),
                    remote=(it.get("workplaceType") == "remote") if it.get("workplaceType") else None,
                    workplace=it.get("workplaceType"),
                    tags=[cat.get("team") or ""],
                    posted_at=it.get("createdAt"),
                )
                if job:
                    out.append(job)
            return out

        return await self._many(self.pick_boards(self.board_tokens()), fetch, limit)


class AshbyAggregator(_Board):
    source_name = "ASHBY"
    # Ashby public job-posting API (no key).
    board_url = "https://api.ashbyhq.com/posting-api/job-board/{board}"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        async def fetch(client: httpx.AsyncClient, board: str) -> list[JobPostCreate]:
            r = await client.get(
                f"https://api.ashbyhq.com/posting-api/job-board/{board}",
                params={"includeCompensation": "true"},
            )
            r.raise_for_status()
            out = []
            for it in require_list(r.json(), "jobs"):
                if it.get("isListed") is False:
                    continue
                job = self._job(
                    ext_id=f"{board}_{it.get('id')}",
                    title=it.get("title", ""),
                    company=board.title(),
                    url=it.get("jobUrl"),
                    description=it.get("descriptionPlain") or it.get("descriptionHtml") or "",
                    location=it.get("location"),
                    job_type=it.get("employmentType"),
                    remote=it.get("isRemote") if isinstance(it.get("isRemote"), bool) else None,
                    workplace=it.get("workplaceType"),
                    tags=[it.get("department") or ""],
                    posted_at=it.get("publishedAt"),
                )
                if job:
                    out.append(job)
            return out

        return await self._many(self.pick_boards(self.board_tokens()), fetch, limit)


class SmartRecruitersAggregator(_Board):
    source_name = "SMARTRECRUITERS"
    # Posting API. api.smartrecruiters.com/robots.txt (Nov 2026) disallows all
    # agents but LinkedInBot, so the robots check keeps this source off.
    board_url = "https://api.smartrecruiters.com/v1/companies/{board}/postings"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        async def fetch(client: httpx.AsyncClient, company: str) -> list[JobPostCreate]:
            r = await client.get(
                f"https://api.smartrecruiters.com/v1/companies/{company}/postings",
                params={"limit": 100},
            )
            r.raise_for_status()
            out = []
            for it in require_list(r.json(), "content"):
                loc = it.get("location") or {}
                place = ", ".join(x for x in (loc.get("city"), loc.get("country", "").upper()) if x)
                dept = (it.get("department") or {}).get("label") or ""
                job = self._job(
                    ext_id=f"{company}_{it.get('id')}",
                    title=it.get("name", ""),
                    company=company,
                    url=f"https://jobs.smartrecruiters.com/{company}/{it.get('id')}",
                    description=f"{it.get('name', '')} — {dept}".strip(" —"),
                    location=("Remote" if loc.get("remote") else place) or None,
                    job_type=(it.get("typeOfEmployment") or {}).get("label"),
                    remote=loc.get("remote") if isinstance(loc.get("remote"), bool) else None,
                    tags=[dept],
                    posted_at=it.get("releasedDate"),
                )
                if job:
                    out.append(job)
            return out

        return await self._many(self.pick_boards(self.board_tokens()), fetch, limit)


class WorkableAggregator(_Board):
    """Workable public job-board widget API (no key), one call per account."""

    source_name = "WORKABLE"
    board_url = "https://apply.workable.com/api/v1/widget/accounts/{board}"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        async def fetch(client: httpx.AsyncClient, account: str) -> list[JobPostCreate]:
            r = await client.get(
                f"https://apply.workable.com/api/v1/widget/accounts/{account}",
                params={"details": "true"},
            )
            r.raise_for_status()
            payload = r.json()
            company = (payload.get("name") if isinstance(payload, dict) else None) or account
            out = []
            for it in require_list(payload, "jobs"):
                place = ", ".join(
                    x for x in (it.get("city"), it.get("state"), it.get("country")) if x
                )
                remote = it.get("telecommuting")
                job = self._job(
                    ext_id=f"{account}_{it.get('shortcode') or it.get('code')}",
                    title=it.get("title", ""),
                    company=company,
                    url=it.get("url") or it.get("shortlink"),
                    description=it.get("description") or "",
                    location=("Remote" + (f" ({place})" if place else "")) if remote else place,
                    job_type=it.get("employment_type"),
                    remote=remote if isinstance(remote, bool) else None,
                    tags=[it.get("department") or ""],
                    posted_at=it.get("published_on") or it.get("created_at"),
                )
                if job:
                    out.append(job)
            return out

        return await self._many(self.pick_boards(self.board_tokens()), fetch, limit)


_NAMED_ENTITY = re.compile(rb"&([A-Za-z][A-Za-z0-9]{1,31});")
_XML_ENTITIES = {b"amp", b"lt", b"gt", b"quot", b"apos"}


def _html_entities_to_numeric(body: bytes) -> bytes:
    """Some feeds (e.g. NoDesk) use HTML named entities such as &rsquo; that are
    not defined in XML; rewrite them as numeric references (no DTD is loaded)."""
    from html.entities import name2codepoint

    def sub(m: re.Match[bytes]) -> bytes:
        name = m.group(1)
        if name in _XML_ENTITIES:
            return m.group(0)
        cp = name2codepoint.get(name.decode("ascii"))
        return f"&#{cp};".encode() if cp else b"&amp;" + name + b";"

    return _NAMED_ENTITY.sub(sub, body)


def _rss_items(body: bytes) -> list[dict[str, str]]:
    """RSS 2.0 <item>s as flat dicts of child tag -> text. Entities are not
    resolved and nothing is fetched (untrusted XML)."""
    from lxml import etree

    parser = etree.XMLParser(resolve_entities=False, no_network=True, huge_tree=False)
    try:
        root = etree.fromstring(_html_entities_to_numeric(body), parser=parser)
    except etree.XMLSyntaxError as exc:
        raise SourceFetchError("malformed RSS") from exc
    if root is None or root.find("channel") is None:
        raise SourceFetchError("payload is not RSS")
    items = []
    for item in root.iter("item"):
        items.append(
            {
                etree.QName(child).localname: (child.text or "").strip()
                for child in item
                if isinstance(child.tag, str)
            }
        )
    return items


class WeWorkRemotelyAggregator(_Board):
    """We Work Remotely category RSS feeds (public, no key). Item titles are
    "Company: Role"; each job links back to the posting on weworkremotely.com."""

    source_name = "WEWORKREMOTELY"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        async def fetch(client: httpx.AsyncClient, feed: str) -> list[JobPostCreate]:
            r = await client.get(f"https://weworkremotely.com/categories/{feed}.rss")
            r.raise_for_status()
            out = []
            for it in _rss_items(r.content):
                company, _, role = (it.get("title") or "").partition(":")
                if not role:
                    company, role = "", company
                link = it.get("link") or it.get("guid")
                job = self._job(
                    ext_id=(link or "").rstrip("/").rsplit("/", 1)[-1] or str(it.get("guid")),
                    title=role,
                    company=company,
                    url=link,
                    description=it.get("description") or "",
                    location="Remote" + (f" ({it['region']})" if it.get("region") else ""),
                    job_type=it.get("type"),
                    remote=True,
                    tags=[it.get("category") or ""],
                    posted_at=it.get("pubDate"),
                )
                if job:
                    out.append(job)
            return out

        return await self._many(_boards(settings.WEWORKREMOTELY_FEEDS), fetch, limit)


async def _cursor_jobs(url: str, limit: int, page_size: int) -> list[dict]:
    """Walk only the requested inventory, preserving opaque cursors and bounding loops."""
    items: list[dict] = []
    cursor: str | None = None
    seen: set[str] = set()
    size_key = "count" if "jobicy.com" in url else "limit"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            while len(items) < limit:
                params: dict[str, str | int] = {size_key: min(page_size, limit)}
                if cursor:
                    params["cursor"] = cursor
                response = await client.get(url, params=params)
                response.raise_for_status()
                payload = response.json()
                batch = require_list(payload, "jobs")
                if not batch:
                    break
                items.extend(batch)
                next_cursor = payload.get("nextCursor")
                if not next_cursor or len(items) >= limit:
                    break
                if not isinstance(next_cursor, str) or next_cursor in seen:
                    raise SourceFetchError("invalid or repeated pagination cursor")
                seen.add(next_cursor)
                cursor = next_cursor
    except SourceFetchError:
        raise
    except Exception as exc:
        raise SourceFetchError(type(exc).__name__) from exc
    return items[:limit]


class JobicyAggregator(_Board):
    source_name = "JOBICY"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        items = await _cursor_jobs("https://jobicy.com/api/jobs", limit, 100)
        out = []
        for it in items:
            job = self._job(
                ext_id=str(it.get("id")),
                title=it.get("jobTitle", ""),
                company=it.get("companyName", ""),
                url=it.get("url"),
                description=it.get("jobDescription") or it.get("jobExcerpt") or "",
                location=f"Remote ({it.get('jobGeo')})" if it.get("jobGeo") else "Remote",
                job_type=(it.get("jobType") or [None])[0],
                remote=True,
                tags=it.get("jobIndustry") or [],
                salary=(
                    it.get("annualSalaryMin"),
                    it.get("annualSalaryMax"),
                    it.get("salaryCurrency"),
                ),
                posted_at=it.get("pubDate"),
            )
            if job:
                out.append(job)
        return out[:limit]


class HimalayasAggregator(_Board):
    source_name = "HIMALAYAS"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        items = await _cursor_jobs("https://himalayas.app/jobs/api", limit, 20)
        out = []
        for it in items[:limit]:
            restrictions = it.get("locationRestrictions") or []
            job = self._job(
                ext_id=str(it.get("guid") or it.get("applicationLink")),
                title=it.get("title", ""),
                company=it.get("companyName", ""),
                url=it.get("applicationLink"),
                description=it.get("description") or it.get("excerpt") or "",
                location="Remote" + (f" ({', '.join(restrictions[:3])})" if restrictions else ""),
                job_type=it.get("employmentType"),
                remote=True,
                tags=it.get("categories") or [],
                salary=(it.get("minSalary"), it.get("maxSalary"), it.get("currency")),
                posted_at=it.get("pubDate"),
            )
            if job:
                out.append(job)
        return out


class WorkingNomadsAggregator(_Board):
    source_name = "WORKINGNOMADS"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        if not settings.WORKINGNOMADS_PERMISSION_CONFIRMED:
            raise SourceDisabledError(
                "Written Working Nomads redistribution permission not confirmed"
            )
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                r = await client.get("https://www.workingnomads.com/api/exposed_jobs/")
                r.raise_for_status()
                items = require_list(r.json())
        except Exception as e:
            raise SourceFetchError(type(e).__name__) from e
        out = []
        for it in items[:limit]:
            tags = [t.strip() for t in (it.get("tags") or "").split(",") if t.strip()]
            job = self._job(
                ext_id=str(it.get("url")),
                title=it.get("title", ""),
                company=it.get("company_name", ""),
                url=it.get("url"),
                description=it.get("description") or "",
                location=it.get("location") or "Remote",
                remote=True,
                tags=[it.get("category_name") or "", *tags],
                posted_at=it.get("pub_date"),
            )
            if job:
                out.append(job)
        return out


class AdzunaAggregator(_Board):
    """Adzuna (free developer key). Disabled until ADZUNA_APP_ID/ADZUNA_APP_KEY are set."""

    source_name = "ADZUNA"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        from app.domains.jobs.aggregators.base import SourceDisabledError

        if not settings.ADZUNA_LICENSE_CONFIRMED:
            raise SourceDisabledError("Adzuna production licence not confirmed")
        if not (settings.ADZUNA_APP_ID and settings.ADZUNA_APP_KEY):
            raise SourceDisabledError("ADZUNA_APP_ID/ADZUNA_APP_KEY not set")
        countries = _boards(settings.ADZUNA_COUNTRIES)
        per = max(10, min(50, limit // max(1, len(countries))))

        # Incremental: only postings newer than the last successful run (max_days_old).
        started = datetime.now(UTC)
        since = self.cursor.get("since")
        try:
            age = (started - datetime.fromisoformat(since)).days + 1 if since else 7
        except (TypeError, ValueError):
            age = 7
        max_days = max(1, min(settings.JOB_RETENTION_DAYS, age))

        async def fetch(client: httpx.AsyncClient, country: str) -> list[JobPostCreate]:
            out = []
            for page in range(1, max(1, settings.ADZUNA_MAX_PAGES) + 1):
                r = await client.get(
                    f"https://api.adzuna.com/v1/api/jobs/{country}/search/{page}",
                    params={
                        "app_id": settings.ADZUNA_APP_ID,
                        "app_key": settings.ADZUNA_APP_KEY,
                        "results_per_page": per,
                        "sort_by": "date",
                        "max_days_old": max_days,
                        "content-type": "application/json",
                    },
                )
                r.raise_for_status()
                results = require_list(r.json(), "results")
                for it in results:
                    job = self._job(
                        ext_id=f"{country}_{it.get('id')}",
                        title=it.get("title", ""),
                        company=(it.get("company") or {}).get("display_name", ""),
                        url=it.get("redirect_url"),
                        description=it.get("description") or "",
                        location=(it.get("location") or {}).get("display_name"),
                        job_type=it.get("contract_type") or it.get("contract_time"),
                        salary=(it.get("salary_min"), it.get("salary_max"), None),
                        posted_at=it.get("created"),
                    )
                    if job:
                        out.append(job)
                if len(results) < per:
                    break
            return out

        self.next_cursor = {"since": started.isoformat()}
        return await self._many(countries, fetch, limit)


class JoobleAggregator(_Board):
    """Jooble (free key, 500 requests per key in total: one request per run)."""

    source_name = "JOOBLE"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        from app.domains.jobs.aggregators.base import SourceDisabledError

        if not settings.JOOBLE_API_KEY:
            raise SourceDisabledError("JOOBLE_API_KEY not set")
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                r = await client.post(
                    f"https://jooble.org/api/{settings.JOOBLE_API_KEY}",
                    json={"keywords": settings.JOOBLE_KEYWORDS, "location": "", "page": 1},
                )
                r.raise_for_status()
                items = require_list(r.json(), "jobs")
        except Exception as e:
            raise SourceFetchError(type(e).__name__) from e
        out = []
        for it in items[:limit]:
            job = self._job(
                ext_id=str(it.get("id")),
                title=it.get("title", ""),
                company=it.get("company", ""),
                url=it.get("link"),
                description=it.get("snippet") or "",
                location=it.get("location"),
                job_type=it.get("type"),
                posted_at=it.get("updated"),
            )
            if job:
                out.append(job)
        return out


ROLE_WORDS = re.compile(
    r"engineer|developer|programmer|designer|manager|scientist|analyst|architect|"
    r"\blead\b|head of|director|researcher|recruiter|writer|marketer|sales|support|"
    r"devops|\bsre\b|\bqa\b|founding|\broles?\b|positions|intern|specialist|consultant",
    re.I,
)


class HackerNewsAggregator(_Board):
    """Hacker News "Ask HN: Who is hiring?" (monthly), via the free Algolia HN API.
    Each top-level post is one employer: "Company | Role | Location | Remote | ...";
    the job links back to the post."""

    source_name = "HACKERNEWS"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                s = await client.get(
                    "https://hn.algolia.com/api/v1/search_by_date",
                    params={
                        "tags": "story,author_whoishiring",
                        "query": "who is hiring",
                        "hitsPerPage": 5,
                    },
                )
                s.raise_for_status()
                story = next(
                    h for h in s.json()["hits"] if h["title"].startswith("Ask HN: Who is hiring?")
                )
                r = await client.get(f"https://hn.algolia.com/api/v1/items/{story['objectID']}")
                r.raise_for_status()
                posts = r.json().get("children", [])
        except Exception as e:
            raise SourceFetchError(type(e).__name__) from e
        out = []
        for p in posts:
            text = p.get("text") or ""
            if not text or not p.get("id"):
                continue
            first = html.unescape(text.split("<p>")[0])
            parts = [self.clean_text(x) for x in first.split("|") if self.clean_text(x)]
            if len(parts) < 2:
                continue
            company = (
                re.sub(
                    r"\s*(https?://\S+|\(?[\w.-]+\.(com|io|ai|co|dev|org|net)\)?)\s*", " ", parts[0]
                ).strip()
                or parts[0]
            )
            role = next((x for x in parts[1:] if ROLE_WORDS.search(x) and "http" not in x), "")
            if not role:
                continue
            # Prefer a field naming a place ("Berlin, Germany"), then a work mode.
            others = [x for x in parts[1:] if x != role and not ROLE_WORDS.search(x)]
            where = next((x for x in others if "," in x), "") or next(
                (
                    x
                    for x in others
                    if any(w in x.lower() for w in (*REMOTE_WORDS, "onsite", "hybrid"))
                ),
                "",
            )
            job = self._job(
                ext_id=str(p["id"]),
                title=role,
                company=company,
                url=f"https://news.ycombinator.com/item?id={p['id']}",
                description=html.unescape(text),
                location=where or "See post",
                remote=_remote(first) or None,
                tags=parts[2:],
                posted_at=p.get("created_at"),
            )
            if job:
                out.append(job)
        return out[:limit]
