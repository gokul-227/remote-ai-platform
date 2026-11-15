"""More remote-job boards with public feeds.

- Get on Board (Latin America tech jobs): public, documented API
  (https://www.getonbrd.com/api-doc), no key; robots.txt allows generic agents
  (content signal "use=reference": we show a summary and link to the posting).
  Paged, 100 per page, newest first.
- REMOTE_RSS: public RSS feeds of remote boards listed in REMOTE_RSS_FEEDS
  (NoDesk, Real Work From Anywhere, Remote First Jobs). Robots.txt allows the
  feeds; their terms do not grant redistribution explicitly, so the source is
  created paused (permission_confirmed=false) until staff confirm each board.
  Landing.jobs (robots.txt disallows /api/), Authentic Jobs (disallows /feed/)
  and Jobspresso (disallows query URLs, which its job feed needs) are excluded.
"""

from __future__ import annotations

import httpx

from app.core.config import settings
from app.domains.jobs.aggregators import robots
from app.domains.jobs.aggregators.base import (
    SourceDisabledError,
    SourceFetchError,
    require_list,
)
from app.domains.jobs.aggregators.public_boards import _Board, _rss_items
from app.domains.jobs.schemas import JobPostCreate


class GetOnBoardAggregator(_Board):
    source_name = "GETONBOARD"
    url = "https://www.getonbrd.com/api/v0/search/jobs"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        out: list[JobPostCreate] = []
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(30.0), headers={"User-Agent": robots.user_agent()}
            ) as c:
                if not await robots.allowed(c, self.url):
                    raise SourceDisabledError("robots.txt disallows the Get on Board API")
                for page in range(1, settings.GETONBOARD_MAX_PAGES + 1):
                    r = await c.get(
                        self.url,
                        params={
                            "query": "",
                            "per_page": 100,
                            "page": page,
                            "expand": '["company"]',
                        },
                    )
                    r.raise_for_status()
                    payload = r.json()
                    items = require_list(payload, "data")
                    for it in items:
                        job = self._from(it)
                        if job:
                            out.append(job)
                    pages = int((payload.get("meta") or {}).get("total_pages") or 0)
                    if page >= pages or len(out) >= limit:
                        break
        except (SourceFetchError, SourceDisabledError):
            raise
        except Exception as exc:
            raise SourceFetchError(type(exc).__name__) from exc
        return out[:limit]

    def _from(self, it: dict) -> JobPostCreate | None:
        a = it.get("attributes") or {}
        company = (((a.get("company") or {}).get("data") or {}).get("attributes") or {}).get("name")
        remote = a.get("remote_modality") == "fully_remote" or a.get("remote") is True
        countries = ", ".join(a.get("countries") or [])
        return self._job(
            ext_id=str(it.get("id")),
            title=a.get("title") or "",
            company=company or "",
            url=(it.get("links") or {}).get("public_url"),
            description="\n".join(
                x for x in (a.get("description"), a.get("functions"), a.get("benefits")) if x
            ),
            location=(f"Remote ({countries})" if countries else "Remote")
            if remote
            else countries or None,
            remote=remote,
            salary=(a.get("min_salary"), a.get("max_salary"), "USD"),
            posted_at=a.get("published_at"),
        )


class RemoteRSSAggregator(_Board):
    source_name = "REMOTE_RSS"
    board_url = "{board}"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        feeds = [f.strip() for f in settings.REMOTE_RSS_FEEDS.split(",") if f.strip()]

        async def fetch(client: httpx.AsyncClient, feed: str) -> list[JobPostCreate]:
            r = await client.get(feed)
            r.raise_for_status()
            out = []
            for it in _rss_items(r.content):
                title = it.get("title") or ""
                role, sep, company = title.rpartition(" at ")
                if not sep:
                    role, company = title, it.get("company") or it.get("creator") or ""
                link = it.get("link") or it.get("guid")
                job = self._job(
                    ext_id=link or title,
                    title=role,
                    company=company,
                    url=link,
                    description=it.get("description") or "",
                    location="Remote" + (f" ({it['region']})" if it.get("region") else ""),
                    remote=True,
                    tags=[it.get("category") or ""],
                    posted_at=it.get("pubDate"),
                )
                if job:
                    out.append(job)
            return out

        return await self._many(feeds, fetch, limit)


REMOTE_FEED_AGGREGATORS = (GetOnBoardAggregator, RemoteRSSAggregator)
