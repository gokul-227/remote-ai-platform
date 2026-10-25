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
from datetime import UTC, datetime

import httpx

from app.core.config import settings
from app.domains.jobs.aggregators.base import BaseAggregator, SourceFetchError
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


class _Board(BaseAggregator):
    """Shared helpers: build a job, fetch many company boards concurrently."""

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
    ) -> JobPostCreate | None:
        title = self.clean_text(title)
        if not title:
            return None
        description = (self.clean_rich_text(description) or title)[: settings.JOB_DESCRIPTION_MAX_CHARS]
        location = self.clean_text(location) or "Remote"
        low, high, currency = salary
        return JobPostCreate(
            title=title,
            description=description,
            company_name=self.clean_text(company) or "Unknown Company",
            location=location,
            is_remote=_remote(location, title) if remote is None else remote,
            job_type=self.normalize_job_type(job_type),
            skills=self.extract_skills(f"{title} {' '.join(tags or [])} {description}"),
            external_id=f"{self.source_name.lower()}_{ext_id}",
            external_url=url,
            source=self.source_name,
            salary_min=low,
            salary_max=high,
            salary_period="year" if low or high else None,
            currency=(currency or "USD")[:3],
        )

    async def _many(self, boards: list[str], fetch, limit: int) -> list[JobPostCreate]:
        """Fetch boards concurrently; one bad board never fails the whole source."""
        sem = asyncio.Semaphore(6)
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:

            async def one(board: str) -> list[JobPostCreate]:
                async with sem:
                    try:
                        return await fetch(client, board)
                    except Exception:
                        return []

            results = await asyncio.gather(*(one(b) for b in boards))
        if boards and not any(results):
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

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        async def fetch(client: httpx.AsyncClient, board: str) -> list[JobPostCreate]:
            r = await client.get(
                f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs",
                params={"content": "true"},
            )
            r.raise_for_status()
            company = board.replace("-", " ").title()
            out = []
            for it in r.json().get("jobs", []):
                job = self._job(
                    ext_id=f"{board}_{it.get('id')}",
                    title=it.get("title", ""),
                    company=company,
                    url=it.get("absolute_url"),
                    description=html.unescape(it.get("content") or ""),
                    location=(it.get("location") or {}).get("name"),
                )
                if job:
                    out.append(job)
            return out

        return await self._many(_shard(_boards(settings.GREENHOUSE_BOARDS)), fetch, limit)


class LeverAggregator(_Board):
    source_name = "LEVER"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        async def fetch(client: httpx.AsyncClient, board: str) -> list[JobPostCreate]:
            r = await client.get(
                f"https://api.lever.co/v0/postings/{board}", params={"mode": "json"}
            )
            r.raise_for_status()
            out = []
            for it in r.json() if isinstance(r.json(), list) else []:
                cat = it.get("categories") or {}
                job = self._job(
                    ext_id=f"{board}_{it.get('id')}",
                    title=it.get("text", ""),
                    company=board.title(),
                    url=it.get("hostedUrl"),
                    description=it.get("descriptionPlain") or it.get("description") or "",
                    location=cat.get("location"),
                    job_type=cat.get("commitment"),
                    remote=(it.get("workplaceType") == "remote") or None,
                    tags=[cat.get("team") or ""],
                )
                if job:
                    out.append(job)
            return out

        return await self._many(_shard(_boards(settings.LEVER_BOARDS)), fetch, limit)


class AshbyAggregator(_Board):
    source_name = "ASHBY"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        async def fetch(client: httpx.AsyncClient, board: str) -> list[JobPostCreate]:
            r = await client.get(
                f"https://api.ashbyhq.com/posting-api/job-board/{board}",
                params={"includeCompensation": "true"},
            )
            r.raise_for_status()
            out = []
            for it in r.json().get("jobs", []):
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
                    remote=bool(it.get("isRemote")) or None,
                    tags=[it.get("department") or ""],
                )
                if job:
                    out.append(job)
            return out

        return await self._many(_shard(_boards(settings.ASHBY_BOARDS)), fetch, limit)


class SmartRecruitersAggregator(_Board):
    source_name = "SMARTRECRUITERS"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        async def fetch(client: httpx.AsyncClient, company: str) -> list[JobPostCreate]:
            r = await client.get(
                f"https://api.smartrecruiters.com/v1/companies/{company}/postings",
                params={"limit": 100},
            )
            r.raise_for_status()
            out = []
            for it in r.json().get("content", []):
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
                    remote=bool(loc.get("remote")) or None,
                    tags=[dept],
                )
                if job:
                    out.append(job)
            return out

        return await self._many(_shard(_boards(settings.SMARTRECRUITERS_COMPANIES)), fetch, limit)


class JobicyAggregator(_Board):
    source_name = "JOBICY"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                r = await client.get(
                    "https://jobicy.com/api/v2/remote-jobs", params={"count": min(limit, 100)}
                )
                r.raise_for_status()
                items = r.json().get("jobs", [])
        except Exception as e:
            raise SourceFetchError(type(e).__name__) from e
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
            )
            if job:
                out.append(job)
        return out[:limit]


class HimalayasAggregator(_Board):
    source_name = "HIMALAYAS"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        items: list[dict] = []
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                offset = 0
                while len(items) < limit:
                    r = await client.get(
                        "https://himalayas.app/jobs/api", params={"limit": 20, "offset": offset}
                    )
                    r.raise_for_status()
                    page = r.json().get("jobs", [])
                    if not page:
                        break
                    items.extend(page)
                    offset += len(page)
        except Exception as e:
            if not items:
                raise SourceFetchError(type(e).__name__) from e
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
            )
            if job:
                out.append(job)
        return out


class WorkingNomadsAggregator(_Board):
    source_name = "WORKINGNOMADS"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                r = await client.get("https://www.workingnomads.com/api/exposed_jobs/")
                r.raise_for_status()
                items = r.json() if isinstance(r.json(), list) else []
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
            )
            if job:
                out.append(job)
        return out


class AdzunaAggregator(_Board):
    """Adzuna (free developer key). Disabled until ADZUNA_APP_ID/ADZUNA_APP_KEY are set."""

    source_name = "ADZUNA"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        from app.domains.jobs.aggregators.base import SourceDisabledError

        if not (settings.ADZUNA_APP_ID and settings.ADZUNA_APP_KEY):
            raise SourceDisabledError("ADZUNA_APP_ID/ADZUNA_APP_KEY not set")
        countries = _boards(settings.ADZUNA_COUNTRIES)
        per = max(10, min(50, limit // max(1, len(countries))))

        async def fetch(client: httpx.AsyncClient, country: str) -> list[JobPostCreate]:
            r = await client.get(
                f"https://api.adzuna.com/v1/api/jobs/{country}/search/1",
                params={
                    "app_id": settings.ADZUNA_APP_ID,
                    "app_key": settings.ADZUNA_APP_KEY,
                    "results_per_page": per,
                    "sort_by": "date",
                    "content-type": "application/json",
                },
            )
            r.raise_for_status()
            out = []
            for it in r.json().get("results", []):
                job = self._job(
                    ext_id=f"{country}_{it.get('id')}",
                    title=it.get("title", ""),
                    company=(it.get("company") or {}).get("display_name", ""),
                    url=it.get("redirect_url"),
                    description=it.get("description") or "",
                    location=(it.get("location") or {}).get("display_name"),
                    job_type=it.get("contract_type") or it.get("contract_time"),
                    salary=(it.get("salary_min"), it.get("salary_max"), None),
                )
                if job:
                    out.append(job)
            return out

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
                items = r.json().get("jobs", [])
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
            )
            if job:
                out.append(job)
        return out
