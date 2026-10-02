"""
RemoteOK API Aggregator Adapter.
"""

import httpx

from app.core.config import settings
from app.domains.jobs.aggregators.base import (
    BaseAggregator,
    SourceFetchError,
    require_list,
)
from app.domains.jobs.schemas import JobPostCreate


class RemoteOKAggregator(BaseAggregator):
    source_name = "REMOTEOK"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        jobs: list[JobPostCreate] = []
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                headers = {"User-Agent": "RemoteAIPlatform/0.1 (contact@remoteaiplatform.com)"}
                response = await client.get(settings.REMOTEOK_API_URL, headers=headers)
                if response.status_code != 200:
                    raise SourceFetchError(f"HTTP {response.status_code}")

                data = response.json()
                # RemoteOK returns list where index 0 is legal metadata
                raw_jobs = require_list(data)[1:]

                for item in raw_jobs[:limit]:
                    if not isinstance(item, dict) or not item.get("position"):
                        continue

                    title = self.clean_text(item.get("position", ""))
                    company = self.clean_text(item.get("company", "Unknown Company"))
                    ext_id = f"remoteok_{item.get('id', item.get('slug'))}"
                    description = self.clean_rich_text(item.get("description", title))
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
                        job_type="unspecified",
                        experience_level=None,
                        salary_min=salary_min,
                        salary_max=salary_max,
                        currency="USD",
                        # RemoteOK publishes annual USD salaries.
                        salary_period="year" if (salary_min or salary_max) else None,
                        skills=skills,
                        external_id=ext_id,
                        external_url=item.get("url")
                        or f"https://remoteok.com/remote-jobs/{item.get('id')}",
                        source=self.source_name,
                    )
                    jobs.append(job)

        except SourceFetchError:
            raise
        except Exception as e:
            raise SourceFetchError(type(e).__name__) from e
        return jobs
