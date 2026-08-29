"""
RemoteOK API Aggregator Adapter.
"""

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.domains.jobs.aggregators.base import BaseAggregator
from app.domains.jobs.schemas import JobPostCreate

logger = get_logger("aggregator.remoteok")


class RemoteOKAggregator(BaseAggregator):
    source_name = "REMOTEOK"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        jobs: list[JobPostCreate] = []
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                headers = {"User-Agent": "RemoteAIPlatform/0.1 (admin@remoteaiplatform.ai)"}
                response = await client.get(settings.REMOTEOK_API_URL, headers=headers)
                if response.status_code != 200:
                    logger.warning(f"RemoteOK API returned status {response.status_code}")
                    return jobs

                data = response.json()
                # RemoteOK returns list where index 0 is legal metadata
                raw_jobs = data[1:] if isinstance(data, list) and len(data) > 1 else []

                for item in raw_jobs[:limit]:
                    if not isinstance(item, dict) or not item.get("position"):
                        continue

                    title = self.clean_text(item.get("position", ""))
                    company = self.clean_text(item.get("company", "Unknown Company"))
                    ext_id = f"remoteok_{item.get('id', item.get('slug'))}"
                    description = self.clean_text(item.get("description", title))
                    tags = item.get("tags", [])
                    skills = self.extract_skills(f"{title} {' '.join(tags)} {description}")

                    salary_min = (
                        float(item.get("salary_min", 0)) if item.get("salary_min") else None
                    )
                    salary_max = (
                        float(item.get("salary_max", 0)) if item.get("salary_max") else None
                    )

                    job = JobPostCreate(
                        title=title,
                        description=description or title,
                        company_name=company,
                        company_logo=item.get("company_logo"),
                        location=self.clean_text(item.get("location") or "Worldwide Remote"),
                        is_remote=True,
                        job_type="full-time",
                        experience_level="mid",
                        salary_min=salary_min,
                        salary_max=salary_max,
                        currency="USD",
                        skills=skills,
                        external_id=ext_id,
                        external_url=item.get("url")
                        or f"https://remoteok.com/remote-jobs/{item.get('id')}",
                        source=self.source_name,
                    )
                    jobs.append(job)

        except Exception as e:
            logger.error(f"Error fetching jobs from RemoteOK: {e}")
        return jobs
