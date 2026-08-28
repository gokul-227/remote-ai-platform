"""
USAJobs API Aggregator Adapter.
"""

from typing import List
import httpx
from app.core.config import settings
from app.core.logging import get_logger
from app.domains.jobs.aggregators.base import BaseAggregator
from app.domains.jobs.schemas import JobPostCreate

logger = get_logger("aggregator.usajobs")


class USAJobsAggregator(BaseAggregator):
    source_name = "USAJOBS"

    async def fetch_jobs(self, limit: int = 100) -> List[JobPostCreate]:
        jobs: List[JobPostCreate] = []
        if not settings.USAJOBS_AUTH_KEY:
            logger.info("USAJOBS_AUTH_KEY not configured, skipping USAJobs aggregation")
            return jobs

        try:
            headers = {
                "User-Agent": settings.USAJOBS_USER_AGENT,
                "Authorization-Key": settings.USAJOBS_AUTH_KEY,
            }
            url = f"{settings.USAJOBS_API_URL}?Keyword=Software%20Engineer&Telework=true"
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, headers=headers)
                if response.status_code != 200:
                    logger.warning(f"USAJobs API returned status {response.status_code}")
                    return jobs

                payload = response.json()
                raw_items = payload.get("SearchResult", {}).get("SearchResultItems", [])

                for wrapper in raw_items[:limit]:
                    item = wrapper.get("MatchedObjectDescriptor", {})
                    if not item or not item.get("PositionTitle"):
                        continue

                    title = self.clean_text(item.get("PositionTitle", ""))
                    company = self.clean_text(item.get("OrganizationName", "US Federal Government"))
                    ext_id = f"usajobs_{item.get('PositionID')}"
                    
                    user_area = item.get("UserArea", {}).get("Details", {})
                    summary = user_area.get("JobSummary") or title
                    description = self.clean_text(summary)
                    skills = self.extract_skills(f"{title} {description}")

                    job = JobPostCreate(
                        title=title,
                        description=description,
                        company_name=company,
                        location="Remote / Telework",
                        is_remote=True,
                        job_type="full-time",
                        experience_level="mid",
                        skills=skills,
                        external_id=ext_id,
                        external_url=item.get("PositionURI"),
                        source=self.source_name,
                    )
                    jobs.append(job)

        except Exception as e:
            logger.error(f"Error fetching jobs from USAJobs: {e}")
        return jobs
