"""
Arbeitnow API Aggregator Adapter.
"""

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.domains.jobs.aggregators.base import BaseAggregator
from app.domains.jobs.schemas import JobPostCreate

logger = get_logger("aggregator.arbeitnow")


class ArbeitnowAggregator(BaseAggregator):
    source_name = "ARBEITNOW"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        jobs: list[JobPostCreate] = []
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(settings.ARBEITNOW_API_URL)
                if response.status_code != 200:
                    logger.warning(f"Arbeitnow API returned status {response.status_code}")
                    return jobs

                payload = response.json()
                raw_jobs = payload.get("data", [])

                for item in raw_jobs[:limit]:
                    if not isinstance(item, dict) or not item.get("title"):
                        continue

                    title = self.clean_text(item.get("title", ""))
                    company = self.clean_text(item.get("company_name", "Unknown Company"))
                    slug = item.get("slug", "")
                    ext_id = f"arbeitnow_{slug}"
                    description = self.clean_text(item.get("description", title))
                    tags = item.get("tags", [])
                    skills = self.extract_skills(f"{title} {' '.join(tags)} {description}")

                    job = JobPostCreate(
                        title=title,
                        description=description or title,
                        company_name=company,
                        location=self.clean_text(item.get("location") or "Remote"),
                        is_remote=item.get("remote", True),
                        job_type="full-time",
                        experience_level="mid",
                        skills=skills,
                        external_id=ext_id,
                        external_url=item.get("url"),
                        source=self.source_name,
                    )
                    jobs.append(job)

        except Exception as e:
            logger.error(f"Error fetching jobs from Arbeitnow: {e}")
        return jobs
