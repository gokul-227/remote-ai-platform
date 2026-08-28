"""
Remotive API Aggregator Adapter.
"""

from typing import List
import httpx
from app.core.config import settings
from app.core.logging import get_logger
from app.domains.jobs.aggregators.base import BaseAggregator
from app.domains.jobs.schemas import JobPostCreate

logger = get_logger("aggregator.remotive")


class RemotiveAggregator(BaseAggregator):
    source_name = "REMOTIVE"

    async def fetch_jobs(self, limit: int = 100) -> List[JobPostCreate]:
        jobs: List[JobPostCreate] = []
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                url = f"{settings.REMOTIVE_API_URL}?category=software-dev"
                response = await client.get(url)
                if response.status_code != 200:
                    logger.warning(f"Remotive API returned status {response.status_code}")
                    return jobs

                payload = response.json()
                raw_jobs = payload.get("jobs", [])

                for item in raw_jobs[:limit]:
                    if not isinstance(item, dict) or not item.get("title"):
                        continue

                    title = self.clean_text(item.get("title", ""))
                    company = self.clean_text(item.get("company_name", "Unknown Company"))
                    job_id = item.get("id")
                    ext_id = f"remotive_{job_id}"
                    description = self.clean_text(item.get("description", title))
                    tags = item.get("tags", [])
                    skills = self.extract_skills(f"{title} {' '.join(tags)} {description}")

                    job = JobPostCreate(
                        title=title,
                        description=description or title,
                        company_name=company,
                        company_logo=item.get("company_logo"),
                        location=self.clean_text(item.get("candidate_required_location") or "Worldwide Remote"),
                        is_remote=True,
                        job_type=item.get("job_type", "full-time").lower(),
                        experience_level="mid",
                        skills=skills,
                        external_id=ext_id,
                        external_url=item.get("url"),
                        source=self.source_name,
                    )
                    jobs.append(job)

        except Exception as e:
            logger.error(f"Error fetching jobs from Remotive: {e}")
        return jobs
