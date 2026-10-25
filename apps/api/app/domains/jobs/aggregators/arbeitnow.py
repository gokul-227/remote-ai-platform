"""
Arbeitnow API Aggregator Adapter.
"""

import httpx

from app.core.config import settings
from app.domains.jobs.aggregators.base import (
    BaseAggregator,
    SourceFetchError,
    require_list,
)
from app.domains.jobs.schemas import JobPostCreate


class ArbeitnowAggregator(BaseAggregator):
    source_name = "ARBEITNOW"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        jobs: list[JobPostCreate] = []
        try:
            raw_jobs: list = []
            async with httpx.AsyncClient(timeout=15.0) as client:
                # 100 jobs per page; read pages until the limit, the last page, or the page cap.
                for page in range(1, settings.ARBEITNOW_MAX_PAGES + 1):
                    response = await client.get(settings.ARBEITNOW_API_URL, params={"page": page})
                    if response.status_code != 200:
                        if page == 1:
                            raise SourceFetchError(f"HTTP {response.status_code}")
                        break
                    payload = response.json()
                    batch = require_list(payload, "data")
                    raw_jobs.extend(batch)
                    if (
                        len(raw_jobs) >= limit
                        or not batch
                        or not (payload.get("links") or {}).get("next")
                    ):
                        break

                for item in raw_jobs[:limit]:
                    if not isinstance(item, dict) or not item.get("title"):
                        continue

                    title = self.clean_text(item.get("title", ""))
                    company = self.clean_text(item.get("company_name", "Unknown Company"))
                    slug = item.get("slug", "")
                    ext_id = f"arbeitnow_{slug}"
                    description = self.clean_rich_text(item.get("description", title))
                    tags = item.get("tags", [])
                    skills = self.extract_skills(f"{title} {' '.join(tags)} {description}")

                    job = JobPostCreate(
                        title=title,
                        description=description or title,
                        company_name=company,
                        location=self.clean_text(item.get("location") or "Remote"),
                        is_remote=item.get("remote", True),
                        job_type=self.normalize_job_type((item.get("job_types") or [None])[0]),
                        experience_level=None,
                        skills=skills,
                        external_id=ext_id,
                        external_url=item.get("url"),
                        source=self.source_name,
                    )
                    jobs.append(job)

        except SourceFetchError:
            raise
        except Exception as e:
            raise SourceFetchError(type(e).__name__) from e
        return jobs
