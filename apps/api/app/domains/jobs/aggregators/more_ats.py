"""More applicant-tracking systems with public, key-free career-site feeds.

Every adapter reads one company board per request, keeps the employer's own
posting URL (applicants apply where the employer receives applications) and
checks robots.txt for that board's host before fetching (see robots.py; many of
these ATSes serve each company on its own subdomain, so the rules differ per
company). Board lists: ``boards/<ats>.txt`` + the matching setting, loaded into
``job_source_boards``.

Terms and limits (read November 2026):
- Recruitee: ``/api/offers/`` is the documented public Careers Site API; no key,
  no published rate limit. https://docs.recruitee.com/reference/offers
- Personio: ``/xml`` is the documented public job-feed export for career pages
  and job boards; some company subdomains disallow all crawling in robots.txt,
  which the robots check honours.
- Teamtailor: each career site publishes ``/jobs.rss`` (public RSS); robots.txt
  allows it for generic agents.
- BambooHR: ``/careers/list`` is the JSON behind the public careers page.
- Breezy HR: ``/json`` is the public positions feed of a company portal.
- Rippling: ``api.rippling.com/platform/api/ats/v1/board/<board>/jobs`` is the
  public job-board API behind ats.rippling.com.
- Workday: the ``/wday/cxs`` endpoint behind each tenant's public career site.
  Workday publishes no third-party terms for it, so the WORKDAY source is
  created paused (permission_confirmed=false) until staff confirm employers.
- JazzHR: not included; its public XML export was retired (HTTP 410).
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

import httpx

from app.domains.jobs.aggregators.base import SourceFetchError, require_list
from app.domains.jobs.aggregators.public_boards import _Board
from app.domains.jobs.schemas import JobPostCreate


def _title_case(token: str) -> str:
    return token.replace("-", " ").replace("_", " ").title()


class RecruiteeAggregator(_Board):
    source_name = "RECRUITEE"
    board_url = "https://{board}.recruitee.com/api/offers/"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        async def fetch(client: httpx.AsyncClient, board: str) -> list[JobPostCreate]:
            r = await client.get(self.board_url.format(board=board))
            r.raise_for_status()
            out = []
            for it in require_list(r.json(), "offers"):
                salary = it.get("salary") or {}
                period = salary.get("period")
                job = self._job(
                    ext_id=f"{board}_{it.get('id')}",
                    title=it.get("title", ""),
                    company=it.get("company_name") or _title_case(board),
                    url=it.get("careers_url"),
                    description=f"{it.get('description') or ''}\n{it.get('requirements') or ''}",
                    location=("Remote" if it.get("remote") else None) or it.get("location"),
                    job_type=(it.get("employment_type_code") or "").split("_")[0],
                    remote=it.get("remote") if isinstance(it.get("remote"), bool) else None,
                    tags=[it.get("department") or "", *(it.get("tags") or [])],
                    salary=(
                        (_num(salary.get("min")), _num(salary.get("max")), salary.get("currency"))
                        if period in (None, "year")
                        else (None, None, None)
                    ),
                    posted_at=_utc_text(it.get("published_at") or it.get("created_at")),
                )
                if job:
                    out.append(job)
            return out

        return await self._many(self.pick_boards(self.board_tokens()), fetch, limit)


def _num(value: object) -> float | None:
    try:
        return float(value) if value not in (None, "") else None  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _utc_text(value: object) -> object:
    """'2026-11-13 15:42:50 UTC' -> ISO 8601."""
    if isinstance(value, str) and value.endswith(" UTC"):
        return value[:-4].replace(" ", "T") + "+00:00"
    return value


def _xml(body: bytes):  # noqa: ANN202 - lxml element
    from lxml import etree

    parser = etree.XMLParser(resolve_entities=False, no_network=True, huge_tree=False)
    try:
        root = etree.fromstring(body, parser=parser)
    except etree.XMLSyntaxError as exc:
        raise SourceFetchError("malformed XML") from exc
    if root is None:
        raise SourceFetchError("empty XML")
    return root


class PersonioAggregator(_Board):
    source_name = "PERSONIO"
    board_url = "https://{board}.jobs.personio.de/xml"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        async def fetch(client: httpx.AsyncClient, board: str) -> list[JobPostCreate]:
            r = await client.get(self.board_url.format(board=board), params={"language": "en"})
            r.raise_for_status()
            root = _xml(r.content)
            if root.tag != "workzag-jobs":
                raise SourceFetchError("payload is not a Personio feed")
            out = []
            for pos in root.iter("position"):
                text = {c.tag: (c.text or "").strip() for c in pos if isinstance(c.tag, str)}
                parts = []
                for jd in pos.iter("jobDescription"):
                    parts.append(
                        f"<h3>{jd.findtext('name') or ''}</h3>{jd.findtext('value') or ''}"
                    )
                office = text.get("office")
                job = self._job(
                    ext_id=f"{board}_{text.get('id')}",
                    title=text.get("name", ""),
                    company=text.get("subcompany") or _title_case(board),
                    url=f"https://{board}.jobs.personio.de/job/{text.get('id')}",
                    description="".join(parts),
                    location=office,
                    job_type=text.get("schedule"),
                    tags=[text.get("department") or "", text.get("occupationCategory") or ""],
                    posted_at=text.get("createdAt"),
                )
                if job:
                    out.append(job)
            return out

        return await self._many(self.pick_boards(self.board_tokens()), fetch, limit)


class TeamtailorAggregator(_Board):
    source_name = "TEAMTAILOR"
    board_url = "https://{board}.teamtailor.com/jobs.rss"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        async def fetch(client: httpx.AsyncClient, board: str) -> list[JobPostCreate]:
            r = await client.get(self.board_url.format(board=board))
            r.raise_for_status()
            root = _xml(r.content)
            channel = root.find("channel")
            if channel is None:
                raise SourceFetchError("payload is not RSS")
            company = (channel.findtext("title") or "").strip() or _title_case(board)
            ns = "{https://teamtailor.com/locations}"
            out = []
            for item in channel.iter("item"):
                places = [
                    ", ".join(
                        x for x in (loc.findtext(f"{ns}city"), loc.findtext(f"{ns}country")) if x
                    )
                    for loc in item.iter(f"{ns}location")
                ]
                status = (item.findtext("remoteStatus") or "").lower()
                where = "; ".join(p for p in places if p)
                job = self._job(
                    ext_id=f"{board}_{item.findtext('guid')}",
                    title=item.findtext("title") or "",
                    company=company,
                    url=item.findtext("link"),
                    description=item.findtext("description") or "",
                    location=(f"Remote ({where})" if where else "Remote")
                    if status == "fully"
                    else where or None,
                    remote=status == "fully" if status else None,
                    tags=[item.findtext(f"{ns}department") or ""],
                    posted_at=item.findtext("pubDate"),
                )
                if job:
                    out.append(job)
            return out

        return await self._many(self.pick_boards(self.board_tokens()), fetch, limit)


class BambooHRAggregator(_Board):
    source_name = "BAMBOOHR"
    board_url = "https://{board}.bamboohr.com/careers/list"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        async def fetch(client: httpx.AsyncClient, board: str) -> list[JobPostCreate]:
            r = await client.get(self.board_url.format(board=board))
            r.raise_for_status()
            if "json" not in r.headers.get("content-type", ""):
                raise SourceFetchError("not a BambooHR careers feed")
            out = []
            for it in require_list(r.json(), "result"):
                loc = it.get("location") or {}
                ats = it.get("atsLocation") or {}
                place = ", ".join(
                    x
                    for x in (
                        loc.get("city") or ats.get("city"),
                        loc.get("state") or ats.get("state") or ats.get("province"),
                        ats.get("country"),
                    )
                    if x
                )
                remote = it.get("isRemote")
                job = self._job(
                    ext_id=f"{board}_{it.get('id')}",
                    title=it.get("jobOpeningName", ""),
                    company=_title_case(board),
                    url=f"https://{board}.bamboohr.com/careers/{it.get('id')}",
                    description=it.get("jobOpeningName", ""),
                    location="Remote" if remote else place or None,
                    job_type=it.get("employmentStatusLabel"),
                    remote=remote if isinstance(remote, bool) else None,
                    tags=[it.get("departmentLabel") or ""],
                )
                if job:
                    out.append(job)
            return out

        return await self._many(self.pick_boards(self.board_tokens()), fetch, limit)


class BreezyAggregator(_Board):
    source_name = "BREEZY"
    board_url = "https://{board}.breezy.hr/json"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        async def fetch(client: httpx.AsyncClient, board: str) -> list[JobPostCreate]:
            r = await client.get(self.board_url.format(board=board))
            r.raise_for_status()
            out = []
            for it in require_list(r.json()):
                loc = it.get("location") or {}
                remote = loc.get("is_remote")
                job = self._job(
                    ext_id=f"{board}_{it.get('id')}",
                    title=it.get("name", ""),
                    company=(it.get("company") or {}).get("name") or _title_case(board),
                    url=it.get("url"),
                    description=it.get("name", ""),
                    location=("Remote" if remote else None) or loc.get("name"),
                    job_type=(it.get("type") or {}).get("name"),
                    remote=remote if isinstance(remote, bool) else None,
                    tags=[it.get("department") or ""],
                    posted_at=it.get("published_date"),
                )
                if job:
                    out.append(job)
            return out

        return await self._many(self.pick_boards(self.board_tokens()), fetch, limit)


class RipplingAggregator(_Board):
    source_name = "RIPPLING"
    board_url = "https://api.rippling.com/platform/api/ats/v1/board/{board}/jobs"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        async def fetch(client: httpx.AsyncClient, board: str) -> list[JobPostCreate]:
            r = await client.get(self.board_url.format(board=board))
            r.raise_for_status()
            out = []
            for it in require_list(r.json()):
                where = (it.get("workLocation") or {}).get("label")
                job = self._job(
                    ext_id=f"{board}_{it.get('uuid')}",
                    title=it.get("name", ""),
                    company=_title_case(board),
                    url=it.get("url"),
                    description=it.get("name", ""),
                    location=where,
                    tags=[(it.get("department") or {}).get("label") or ""],
                )
                if job:
                    out.append(job)
            return out

        return await self._many(self.pick_boards(self.board_tokens()), fetch, limit)


_POSTED = re.compile(r"posted\s+(today|yesterday|(\d+)\+?\s+days?\s+ago)", re.I)


def workday_posted(text: str | None, now: datetime | None = None) -> datetime | None:
    """'Posted Today' / 'Posted Yesterday' / 'Posted 3 Days Ago' / 'Posted 30+ Days Ago'."""
    m = _POSTED.search(text or "")
    if not m:
        return None
    now = now or datetime.now(UTC)
    word = m.group(1).lower()
    days = 0 if word == "today" else 1 if word == "yesterday" else int(m.group(2))
    return now - timedelta(days=days)


class WorkdayAggregator(_Board):
    """Workday career sites ("tenant/wdN/site"). Paused by default; see module docstring."""

    source_name = "WORKDAY"
    board_url = ""  # robots.txt is checked per site in fetch_jobs
    page_size = 20
    max_pages = 10

    @staticmethod
    def _parts(board: str) -> tuple[str, str, str]:
        tenant, wd, site = board.split("/", 2)
        return tenant, wd, site

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        async def fetch(client: httpx.AsyncClient, board: str) -> list[JobPostCreate]:
            tenant, wd, site = self._parts(board)
            host = f"https://{tenant}.{wd}.myworkdayjobs.com"
            out: list[JobPostCreate] = []
            for page in range(self.max_pages):
                r = await client.post(
                    f"{host}/wday/cxs/{tenant}/{site}/jobs",
                    json={
                        "appliedFacets": {},
                        "limit": self.page_size,
                        "offset": page * self.page_size,
                        "searchText": "",
                    },
                    headers={"Accept": "application/json"},
                )
                r.raise_for_status()
                payload = r.json()
                items = require_list(payload, "jobPostings")
                for it in items:
                    path = it.get("externalPath") or ""
                    job = self._job(
                        ext_id=f"{tenant}_{path.rsplit('_', 1)[-1] or path}",
                        title=it.get("title", ""),
                        company=_title_case(tenant),
                        url=f"{host}/{site}{path}",
                        description=it.get("title", ""),
                        location=it.get("locationsText"),
                        posted_at=workday_posted(it.get("postedOn")),
                    )
                    if job:
                        out.append(job)
                total = payload.get("total") or 0
                if len(items) < self.page_size or (page + 1) * self.page_size >= total:
                    break
            return out

        sites = self.pick_boards(self.board_tokens())
        valid = [s for s in sites if s.count("/") >= 2]
        from app.domains.jobs.aggregators import robots

        allowed: list[str] = []
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(20.0), headers={"User-Agent": robots.user_agent()}
        ) as client:
            for s in valid:
                tenant, wd, site = self._parts(s)
                if await robots.allowed(
                    client, f"https://{tenant}.{wd}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs"
                ):
                    allowed.append(s)
        if valid and not allowed:
            from app.domains.jobs.aggregators.base import SourceDisabledError

            raise SourceDisabledError("robots.txt disallows every configured Workday site")
        return await self._many(allowed, fetch, limit)


ATS_AGGREGATORS = (
    RecruiteeAggregator,
    PersonioAggregator,
    TeamtailorAggregator,
    BambooHRAggregator,
    BreezyAggregator,
    RipplingAggregator,
    WorkdayAggregator,
)
