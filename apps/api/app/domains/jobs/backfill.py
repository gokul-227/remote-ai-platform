"""Backfill the search-filter columns of stored jobs (migration 074).

Batched by primary key (keyset, never OFFSET): each batch reads up to
`batch_size` rows whose `derived_version` is older than DERIVE_VERSION (or NULL;
partial index ix_job_posts_underived), derives their fields with the same
rules as imports and commits, so no transaction holds many rows and the
task can stop and resume anywhere. Stated values are never overwritten with
NULL: only empty columns and rule-owned columns are written.
"""

from typing import Any

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.jobs.derive import DERIVE_VERSION, derive_fields, filter_columns
from app.domains.jobs.models import JobPost


async def backfill_filters(
    db: AsyncSession, batch_size: int = 1000, max_batches: int = 50
) -> dict[str, Any]:
    done = 0
    last_id = None
    for _ in range(max_batches):
        stmt = (
            select(JobPost)
            .where(
                or_(JobPost.derived_version.is_(None), JobPost.derived_version < DERIVE_VERSION)
            )
            .order_by(JobPost.id)
            .limit(batch_size)
        )
        if last_id is not None:
            stmt = stmt.where(JobPost.id > last_id)
        rows = (await db.scalars(stmt)).all()
        if not rows:
            break
        for job in rows:
            d = derive_fields(
                title=job.title,
                description=job.description,
                company_name=job.company_name,
                location=job.location,
                is_remote=job.is_remote,
                job_type=None if job.job_type == "unspecified" else job.job_type,
                experience_level=job.experience_level,
                salary_min=job.salary_min,
                salary_max=job.salary_max,
                salary_period=job.salary_period,
                currency=job.currency,
                source=job.source,
                stated={
                    "workplace_type": job.workplace_type,
                    "seniority": job.seniority,
                    "country_code": job.country_code,
                    "industry": job.industry,
                    "job_function": job.job_function,
                    "visa_sponsorship": job.visa_sponsorship,
                    "language": job.language,
                },
            )
            # updated_at kept: a backfill is not a content change (sitemap lastmod).
            values: dict[str, Any] = {
                **filter_columns(d),
                "derived_version": DERIVE_VERSION,
                "updated_at": JobPost.updated_at,
            }
            if d.job_type and job.job_type == "unspecified":
                values["job_type"] = d.job_type
            if job.salary_min is None and job.salary_max is None and d.salary_min is not None:
                values.update(
                    salary_min=d.salary_min,
                    salary_max=d.salary_max,
                    salary_period=d.salary_period,
                    currency=d.currency or job.currency,
                )
            await db.execute(
                update(JobPost)
                .where(JobPost.id == job.id)
                .values(**values)
                .execution_options(synchronize_session=False)
            )
        last_id = rows[-1].id
        done += len(rows)
        await db.commit()
        db.expunge_all()
        if len(rows) < batch_size:
            break
    remaining = await db.scalar(
        select(JobPost.id)
        .where(or_(JobPost.derived_version.is_(None), JobPost.derived_version < DERIVE_VERSION))
        .limit(1)
    )
    return {"updated": done, "complete": remaining is None}
