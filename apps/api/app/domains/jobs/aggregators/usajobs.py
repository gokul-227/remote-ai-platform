"""
USAJobs API Aggregator Adapter.
"""

import httpx

from app.core.config import settings
from app.domains.jobs.aggregators.base import (
    BaseAggregator,
    SourceDisabledError,
    SourceFetchError,
    require_list,
)
from app.domains.jobs.schemas import JobPostCreate


class USAJobsAggregator(BaseAggregator):
    source_name = "USAJOBS"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        jobs: list[JobPostCreate] = []
        if not settings.USAJOBS_AUTH_KEY:
            raise SourceDisabledError("USAJOBS_AUTH_KEY not configured")

        try:
            headers = {
                "User-Agent": settings.USAJOBS_USER_AGENT,
                "Authorization-Key": settings.USAJOBS_AUTH_KEY,
            }
            url = f"{settings.USAJOBS_API_URL}?RemoteIndicator=True&ResultsPerPage=100"
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, headers=headers)
                if response.status_code != 200:
                    raise SourceFetchError(f"HTTP {response.status_code}")

                payload = response.json()
                search_result = payload.get("SearchResult") if isinstance(payload, dict) else None
                raw_items = require_list(search_result, "SearchResultItems")

                for wrapper in raw_items[:limit]:
                    item = wrapper.get("MatchedObjectDescriptor", {})
                    if not item or not item.get("PositionTitle"):
                        continue

                    title = self.clean_text(item.get("PositionTitle", ""))
                    company = self.clean_text(item.get("OrganizationName", "US Federal Government"))
                    ext_id = f"usajobs_{item.get('PositionID')}"

                    user_area = item.get("UserArea", {}).get("Details", {})
                    summary = user_area.get("JobSummary") or title
                    description = self.clean_rich_text(summary)
                    skills = self.extract_skills(f"{title} {description}")

                    job = JobPostCreate(
                        title=title,
                        description=description,
                        company_name=company,
                        location="Remote / Telework",
                        is_remote=True,
                        job_type="unspecified",
                        experience_level=None,
                        skills=skills,
                        external_id=ext_id,
                        external_url=item.get("PositionURI"),
                        source=self.source_name,
                    )
                    jobs.append(job)

        except SourceFetchError:
            raise
        except Exception as e:
            raise SourceFetchError(type(e).__name__) from e
        return jobs
