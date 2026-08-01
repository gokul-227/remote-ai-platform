"""
The Muse API Aggregator Adapter.
"""

from typing import List
import httpx
from app.core.config import settings
from app.core.logging import get_logger
from app.domains.jobs.aggregators.base import BaseAggregator
from app.domains.jobs.schemas import JobPostCreate

logger = get_logger("aggregator.themuse")


class TheMuseAggregator(BaseAggregator):
    source_name = "THEMUSE"

    async def fetch_jobs(self, limit: int = 100) -> List[JobPostCreate]:
        jobs: List[JobPostCreate] = []
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                url = f"{settings.THEMUSE_API_URL}?category=Software%20Engineering&page=1"
                response = await client.get(url)
                if response.status_code != 200:
                    logger.warning(f"TheMuse API returned status {response.status_code}")
                    return jobs

                payload = response.json()
                raw_jobs = payload.get("results", [])

                for item in raw_jobs[:limit]:
                    if not isinstance(item, dict) or not item.get("name"):
                        continue

                    title = item.get("name", "")
                    company_dict = item.get("company", {})
                    company = company_dict.get("name", "Unknown Company") if isinstance(company_dict, dict) else "Unknown Company"
                    job_id = item.get("id")
                    ext_id = f"themuse_{job_id}"
                    description = self.clean_text(item.get("contents", title))
                    
                    locations = item.get("locations", [])
                    loc_str = locations[0].get("name") if locations and isinstance(locations[0], dict) else "Remote"

                    skills = self.extract_skills(f"{title} {description}")

                    job = JobPostCreate(
                        title=title,
                        description=description or title,
                        company_name=company,
                        location=loc_str,
                        is_remote="flexible" in loc_str.lower() or "remote" in loc_str.lower(),
                        job_type="full-time",
                        experience_level="mid",
                        skills=skills,
                        external_id=ext_id,
                        external_url=item.get("refs", {}).get("landing_page"),
                        source=self.source_name,
                    )
                    jobs.append(job)

        except Exception as e:
            logger.error(f"Error fetching jobs from TheMuse: {e}")
        return jobs
