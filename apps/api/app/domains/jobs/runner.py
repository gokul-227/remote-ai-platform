"""
Job import worker: run one source (or the catalogue maintenance) straight against
the database, outside the web API. The scheduled workflow runs this on GitHub's
runners, so parsing thousands of postings never slows the API users are on.

    python -m app.domains.jobs.runner --source GREENHOUSE
    python -m app.domains.jobs.runner --maintenance
"""

import argparse
import asyncio
import json
import sys

from app.core.config import settings
from app.core.database import AsyncSessionFactory
from app.domains.admin.repository import AdminRepository
from app.domains.jobs.repository import JobRepository
from app.domains.jobs.service import AGGREGATORS, JobService


async def run(source: str | None, maintenance: bool) -> dict[str, int]:
    async with AsyncSessionFactory() as db:
        service = JobService(JobRepository(db))
        if maintenance:
            return await service.maintain_catalogue()
        return await service.sync_all_job_sources(
            limit_per_source=settings.JOB_SYNC_MAX_PER_SOURCE,
            admin_repo=AdminRepository(db),
            source_name=source,
            run_maintenance=False,
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--source", choices=[a.source_name for a in AGGREGATORS])
    group.add_argument("--maintenance", action="store_true")
    group.add_argument("--list", action="store_true", help="print the source names")
    args = parser.parse_args()
    if args.list:
        print(" ".join(a.source_name for a in AGGREGATORS))
        return 0
    stats = asyncio.run(run(args.source, args.maintenance))
    print(json.dumps(stats))
    return 0


if __name__ == "__main__":
    sys.exit(main())
