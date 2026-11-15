"""
Repository pattern for Job Post domain.
"""

import re
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import (
    ARRAY,
    Select,
    String,
    Text,
    case,
    cast,
    delete,
    func,
    literal,
    literal_column,
    or_,
    select,
    text,
    tuple_,
    update,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domains.applications.models import JobApplication
from app.domains.jobs.derive import DERIVE_VERSION, STATED_FIELDS
from app.domains.jobs.models import JobCatalogueStat, JobEmployerStat, JobPost
from app.domains.jobs.schemas import JobPostCreate, JobPostUpdate
from app.domains.jobs.source_policy import SEARCH_SYNDICATION_BLOCKED_SOURCES

# Must stay identical to FTS_EXPR in alembic/versions/070_jobs_scale_storage.py.
JOB_FTS_EXPR = (
    "to_tsvector('simple'::regconfig, job_posts.title || ' ' || job_posts.company_name"
    " || ' ' || left(job_posts.description, 1000))"
)


# Search-filter columns derived on import (derive.py); stored as derived.
FILTER_COLUMNS = (*STATED_FIELDS, "region", "tz_min", "tz_max")


def slugify(text: str) -> str:
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_-]+", "-", slug)
    return slug[:200]


class JobRepository:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.expired_job_ids: list[uuid.UUID] = []

    async def get_by_id(self, job_id: uuid.UUID) -> JobPost | None:
        stmt = select(JobPost).where(JobPost.id == job_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_slug(self, slug: str) -> JobPost | None:
        stmt = select(JobPost).where(JobPost.slug == slug)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_external_id(self, external_id: str) -> JobPost | None:
        stmt = select(JobPost).where(JobPost.external_id == external_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, data: JobPostCreate) -> JobPost:
        base_slug = slugify(f"{data.title}-{data.company_name}")
        slug = f"{base_slug}-{uuid.uuid4().hex[:6]}"

        job = JobPost(
            company_id=data.company_id,
            title=data.title,
            slug=slug,
            description=data.description,
            company_name=data.company_name,
            company_logo=data.company_logo,
            location=data.location,
            is_remote=data.is_remote,
            job_type=data.job_type,
            experience_level=data.experience_level,
            budget_min=data.budget_min,
            budget_max=data.budget_max,
            timeline=data.timeline,
            remote_preference=data.remote_preference,
            salary_min=data.salary_min,
            salary_max=data.salary_max,
            salary_period=data.salary_period,
            currency=data.currency,
            skills=data.skills,
            ai_analysis=data.ai_analysis,
            external_id=data.external_id,
            external_url=data.external_url,
            source=data.source,
            dedup_key=data.dedup_key,
            is_active=True,
            **{k: getattr(data, k) for k in FILTER_COLUMNS},
            derived_version=DERIVE_VERSION,
        )
        if data.posted_at is not None:
            job.posted_at = data.posted_at
        self.db.add(job)
        await self.db.flush()
        await self.db.refresh(job)
        return job

    async def update(self, job_id: uuid.UUID, data: JobPostUpdate) -> JobPost | None:
        job = await self.get_by_id(job_id)
        if not job:
            return None
        updates = data.model_dump(exclude_unset=True)
        for field, value in updates.items():
            if field == "skills" and value is not None:
                job.skills = value
            elif hasattr(job, field):
                setattr(job, field, value)
        await self.db.flush()
        await self.db.refresh(job)
        return job

    async def upsert_external_job(self, data: JobPostCreate) -> tuple[JobPost, bool]:
        """Returns (job, created) where created=True if a new row was inserted."""
        if not data.external_id:
            return await self.create(data), True

        existing = await self.get_by_external_id(data.external_id)
        now = datetime.now(UTC)
        if existing:
            existing.last_seen_at = now
            existing.expired_at = None  # listed again by its source
            existing.title = data.title
            existing.description = data.description
            existing.company_name = data.company_name or existing.company_name
            existing.company_logo = data.company_logo or existing.company_logo
            existing.location = data.location
            existing.is_remote = data.is_remote
            existing.skills = data.skills
            existing.external_url = data.external_url or existing.external_url
            existing.dedup_key = data.dedup_key or existing.dedup_key
            for k in FILTER_COLUMNS:
                setattr(existing, k, getattr(data, k))
            if data.job_type != "unspecified":
                existing.job_type = data.job_type
            existing.derived_version = DERIVE_VERSION
            if data.salary_min:
                existing.salary_min = data.salary_min
            if data.salary_max:
                existing.salary_max = data.salary_max
            if data.salary_period:
                existing.salary_period = data.salary_period
            await self.db.flush()
            return existing, False

        job = await self.create(data)
        job.last_seen_at = now
        await self.db.flush()
        return job, True

    async def bulk_upsert_external_jobs(
        self, jobs: list[JobPostCreate]
    ) -> tuple[list[uuid.UUID], int]:
        """PostgreSQL only: insert-or-update a batch of imported jobs in one statement
        (keyed on external_id). Returns (ids of newly inserted jobs, number updated).
        Same rules as upsert_external_job: a re-listed job is refreshed and un-expired."""
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        now = datetime.now(UTC)
        rows: dict[str, dict[str, Any]] = {}
        for d in jobs:
            if not d.external_id:
                continue
            rows[d.external_id] = {  # last one wins within a batch
                "posted_at": d.posted_at or now,
                "dedup_key": d.dedup_key,
                "id": uuid.uuid4(),
                "company_id": d.company_id,
                "title": d.title,
                "slug": f"{slugify(f'{d.title}-{d.company_name}')}-{uuid.uuid4().hex[:6]}",
                "description": d.description,
                "company_name": d.company_name,
                "company_logo": d.company_logo,
                "location": d.location,
                "is_remote": d.is_remote,
                "job_type": d.job_type,
                "experience_level": d.experience_level,
                "budget_min": d.budget_min,
                "budget_max": d.budget_max,
                "timeline": d.timeline,
                "remote_preference": d.remote_preference,
                "salary_min": d.salary_min,
                "salary_max": d.salary_max,
                "salary_period": d.salary_period,
                "currency": d.currency,
                "skills": d.skills,
                "external_id": d.external_id,
                "external_url": d.external_url,
                "source": d.source,
                "last_seen_at": now,
                **{k: getattr(d, k) for k in FILTER_COLUMNS},
                "derived_version": DERIVE_VERSION,
            }
        if not rows:
            return [], 0
        insert = pg_insert(JobPost).values(list(rows.values()))
        ex = insert.excluded
        # Re-listing an unchanged job only touches the row when last_seen_at is
        # stale (or it was expired): at millions of rows, rewriting every row (and
        # its TOASTed description) on every 3-hourly run is most of the table bloat.
        stale_seen = func.coalesce(JobPost.last_seen_at, JobPost.created_at) < ex.last_seen_at - timedelta(
            hours=settings.JOB_LAST_SEEN_REFRESH_HOURS
        )
        changed = or_(
            JobPost.expired_at.is_not(None),
            stale_seen,
            JobPost.title.is_distinct_from(ex.title),
            JobPost.description.is_distinct_from(ex.description),
            JobPost.location.is_distinct_from(ex.location),
            JobPost.is_remote.is_distinct_from(ex.is_remote),
            JobPost.external_url.is_distinct_from(ex.external_url),
            JobPost.salary_min.is_distinct_from(ex.salary_min),
            JobPost.salary_max.is_distinct_from(ex.salary_max),
        )
        stmt = insert.on_conflict_do_update(
            index_elements=[JobPost.external_id],
            where=changed,
            set_={
                "dedup_key": func.coalesce(ex.dedup_key, JobPost.dedup_key),
                "title": ex.title,
                "description": ex.description,
                "company_name": func.coalesce(ex.company_name, JobPost.company_name),
                "company_logo": func.coalesce(ex.company_logo, JobPost.company_logo),
                "location": ex.location,
                "is_remote": ex.is_remote,
                "skills": ex.skills,
                "external_url": func.coalesce(ex.external_url, JobPost.external_url),
                "salary_min": func.coalesce(ex.salary_min, JobPost.salary_min),
                "salary_max": func.coalesce(ex.salary_max, JobPost.salary_max),
                "salary_period": func.coalesce(ex.salary_period, JobPost.salary_period),
                **{k: getattr(ex, k) for k in FILTER_COLUMNS},
                "derived_version": ex.derived_version,
                "last_seen_at": ex.last_seen_at,
                "expired_at": None,
                "updated_at": func.now(),
            },
        ).returning(JobPost.id, text("(xmax = 0) AS inserted"))
        result = (await self.db.execute(stmt)).all()
        inserted = [r[0] for r in result if r[1]]
        return inserted, len(result) - len(inserted)

    async def expire_unseen_jobs(self, source: str) -> int:
        """Take this source's imported jobs off the public list when no sync has
        seen them among the source's recent listings for JOB_UNSEEN_EXPIRY_DAYS
        (a freshness policy: they may still be open at the source). Called only
        after that source synced successfully; posted jobs never auto-expire."""
        cutoff = datetime.now(UTC) - timedelta(days=settings.JOB_UNSEEN_EXPIRY_DAYS)
        stale = (
            JobPost.source == source,
            JobPost.company_id.is_(None),
            JobPost.expired_at.is_(None),
            JobPost.last_seen_at < cutoff,
        )
        # Remembered so the import can tell search engines these pages are gone.
        ids = list((await self.db.scalars(select(JobPost.id).where(*stale))).all())
        result = await self.db.execute(
            update(JobPost)
            .where(JobPost.id.in_(ids), JobPost.expired_at.is_(None))
            .values(expired_at=datetime.now(UTC))
            .execution_options(synchronize_session=False)
        )
        self.expired_job_ids.extend(ids)
        return int(getattr(result, "rowcount", 0) or 0)  # CursorResult for UPDATE

    async def duplicates_elsewhere(
        self, jobs: list[JobPostCreate]
    ) -> set[str]:
        """External ids in `jobs` that are the same posting as a live job already
        stored under a different external id (same dedup key or same canonical
        apply URL), usually the same opening on another board. The first source to
        list a posting keeps it; later copies are skipped."""
        keys = {j.dedup_key for j in jobs if j.dedup_key}
        urls = {j.external_url for j in jobs if j.external_url}
        if not keys and not urls:
            return set()
        ext_ids = [j.external_id for j in jobs if j.external_id]
        stmt = select(JobPost.dedup_key, JobPost.external_url).where(
            or_(JobPost.dedup_key.in_(keys), JobPost.external_url.in_(urls)),
            JobPost.external_id.not_in(ext_ids),
            JobPost.is_deleted.is_(False),
            JobPost.expired_at.is_(None),
        )
        taken_keys: set[str] = set()
        taken_urls: set[str] = set()
        for key, url in (await self.db.execute(stmt)).all():
            if key:
                taken_keys.add(key)
            if url:
                taken_urls.add(url)
        return {
            j.external_id
            for j in jobs
            if j.external_id and (j.dedup_key in taken_keys or j.external_url in taken_urls)
        }

    def _referenced(self):  # noqa: ANN202 - a SQL expression
        """Jobs a member holds on to: applied to or saved. Retention keeps these
        rows (hidden from listings) so applications and saved lists never break."""
        from app.domains.saved_jobs.models import SavedJob

        # EXISTS, not IN (subquery): with millions of saved/applied rows the IN
        # list no longer fits work_mem as a hash and PostgreSQL rescans it per job
        # (retention batches went past 30 s at 10M jobs). EXISTS is an index probe.
        return or_(
            select(JobApplication.job_id).where(JobApplication.job_id == JobPost.id).exists(),
            select(SavedJob.job_id).where(SavedJob.job_id == JobPost.id).exists(),
        )

    async def purge_old_imported_jobs(
        self, days: int, batch_size: int | None = None, max_batches: int | None = None
    ) -> tuple[int, int]:
        """Retention for imported jobs posted (or, without a source date, first seen)
        more than `days` ago, in batches so millions of rows never sit in one
        transaction: delete the ones nobody applied to or saved (matches and
        reports cascade), and only expire the referenced ones so members keep
        their history. Posted jobs (owned by a company on the platform) are never
        touched. Returns (deleted, expired)."""
        batch_size = batch_size or settings.JOB_RETENTION_BATCH_SIZE
        max_batches = max_batches or settings.JOB_RETENTION_MAX_BATCHES
        cutoff = datetime.now(UTC) - timedelta(days=days)
        old = (JobPost.company_id.is_(None), JobPost.source != "DIRECT", JobPost.posted_at < cutoff)
        removed = hidden = 0
        for _ in range(max_batches):
            ids = (
                await self.db.execute(
                    select(JobPost.id).where(*old, ~self._referenced()).limit(batch_size)
                )
            ).scalars().all()
            if not ids:
                break
            result = await self.db.execute(
                delete(JobPost)
                .where(JobPost.id.in_(ids))
                .execution_options(synchronize_session=False)
            )
            removed += int(getattr(result, "rowcount", 0) or 0)
            await self.db.commit()
            if len(ids) < batch_size:
                break
        for _ in range(max_batches):
            ids = (
                await self.db.execute(
                    select(JobPost.id).where(*old, JobPost.expired_at.is_(None)).limit(batch_size)
                )
            ).scalars().all()
            if not ids:
                break
            result = await self.db.execute(
                update(JobPost)
                .where(JobPost.id.in_(ids))
                .values(expired_at=datetime.now(UTC))
                .execution_options(synchronize_session=False)
            )
            hidden += int(getattr(result, "rowcount", 0) or 0)
            await self.db.commit()
            if len(ids) < batch_size:
                break
        return removed, hidden

    async def database_megabytes(self) -> float | None:
        """Current database size (PostgreSQL only; None elsewhere)."""
        if self.db.bind is None or self.db.bind.dialect.name != "postgresql":
            return None
        size = await self.db.scalar(text("select pg_database_size(current_database())"))
        return float(size or 0) / 1024 / 1024

    async def trim_to_size_budget(self, budget_mb: float) -> int:
        """Keep the largest catalogue the database budget allows: from the average size
        of a job row and the space everything else uses, work out how many jobs fit, and
        delete only the oldest imported jobs beyond that (never posted jobs, never jobs
        someone applied to). Deleted space is reused by PostgreSQL, so the database stops
        growing at the budget. Returns how many jobs were deleted."""
        if self.db.bind is None or self.db.bind.dialect.name != "postgresql":
            return 0
        # reltuples (kept current by autovacuum/analyze) instead of count(*): an
        # exact count is a full scan of millions of rows on every import run.
        row = (
            await self.db.execute(
                text(
                    "select pg_database_size(current_database()), "
                    "pg_total_relation_size('job_posts'), "
                    "greatest((select reltuples from pg_class where oid = 'job_posts'::regclass), 0)"
                )
            )
        ).one()
        db_bytes, job_bytes, jobs = int(row[0]), int(row[1]), int(row[2])
        if jobs <= 0:  # never analyzed (fresh database): count it once
            jobs = int(await self.db.scalar(select(func.count()).select_from(JobPost)) or 0)
        if not jobs or budget_mb <= 0:  # 0 = no budget
            return 0
        per_job = job_bytes / jobs
        room = budget_mb * 1024 * 1024 - (db_bytes - job_bytes)
        fits = max(0, int(room / per_job))
        excess = jobs - fits
        removed = 0
        batch = settings.JOB_RETENTION_BATCH_SIZE
        # Oldest first, in committed batches: one DELETE of millions of rows would
        # hold locks and bloat WAL for the whole run.
        for _ in range(settings.JOB_RETENTION_MAX_BATCHES):
            if excess - removed <= 0:
                break
            oldest = (
                select(JobPost.id)
                .where(
                    JobPost.company_id.is_(None),
                    JobPost.source != "DIRECT",
                    ~self._referenced(),
                )
                .order_by(JobPost.posted_at.asc())
                .limit(min(batch, excess - removed))
            )
            result = await self.db.execute(
                delete(JobPost)
                .where(JobPost.id.in_(oldest))
                .execution_options(synchronize_session=False)
            )
            n = int(getattr(result, "rowcount", 0) or 0)
            removed += n
            await self.db.commit()
            if n == 0:
                break
        return removed

    async def sitemap_entries(
        self, skip: int, limit: int
    ) -> list[tuple[uuid.UUID, datetime, datetime]]:
        """id/posted/updated of every publicly listed job (any location), oldest
        first so pages stay stable while new jobs arrive."""
        stmt = self._filtered(select(JobPost.id, JobPost.posted_at, JobPost.updated_at)).where(
            *self._sitemap_scope()
        )
        stmt = stmt.order_by(JobPost.posted_at.asc(), JobPost.id.asc()).offset(skip).limit(limit)
        return [(r[0], r[1], r[2]) for r in (await self.db.execute(stmt)).all()]

    async def sitemap_count(self) -> int:
        """Count the same public, syndication-eligible rows as sitemap_entries."""
        stmt = self._filtered(select(func.count(JobPost.id))).where(*self._sitemap_scope())
        return int((await self.db.scalar(stmt)) or 0)

    @staticmethod
    def _sitemap_scope() -> tuple:
        """Syndication-eligible jobs posted within SITEMAP_JOB_MAX_AGE_DAYS."""
        fresh = datetime.now(UTC) - timedelta(days=settings.SITEMAP_JOB_MAX_AGE_DAYS)
        return (
            JobPost.source.not_in(SEARCH_SYNDICATION_BLOCKED_SOURCES),
            JobPost.posted_at >= fresh,
        )


    def _pg(self) -> bool:
        return bool(self.db.get_bind().dialect.name == "postgresql")

    def _filtered(self, stmt: Select, skip_facet: str | None = None, **f: Any) -> Select:
        """Apply every search filter (see JobSearchQuery). `skip_facet` leaves
        one facet's own filter out, so its facet counts show the alternatives."""
        unknown = set(f) - FILTER_KEYS
        if unknown:
            raise TypeError(f"unknown job filters: {sorted(unknown)}")
        stmt = stmt.where(
            JobPost.is_active.is_(True), JobPost.is_deleted.is_(False), JobPost.expired_at.is_(None)
        )
        # Imported jobs past the retention window leave listings at once, even
        # before the nightly retention task deletes them.
        posted_cutoff = datetime.now(UTC) - timedelta(days=settings.JOB_RETENTION_DAYS)
        stmt = stmt.where(
            or_(
                JobPost.company_id.is_not(None),
                JobPost.posted_at.is_(None),
                JobPost.posted_at >= posted_cutoff,
            )
        )

        def want(name: str) -> Any:
            return None if name == skip_facet else f.get(name)

        if employer := f.get("employer"):
            # Exact (case-insensitive) employer name, for /remote-jobs/at/<employer>.
            stmt = stmt.where(func.lower(JobPost.company_name) == employer.strip().lower())

        if f.get("company_id") is not None:
            stmt = stmt.where(JobPost.company_id == f["company_id"])

        if location := f.get("location"):
            # Substring of the posting's free-text location (a city, "Europe");
            # "a|b" matches either spelling ("usa|united states").
            needles = [
                n.strip().lower().replace("%", "").replace("_", "") for n in location.split("|")[:5]
            ]
            needles = [n for n in needles if n]
            if needles:
                stmt = stmt.where(or_(*(func.lower(JobPost.location).contains(n) for n in needles)))

        workplace = _as_list(want("workplace"))
        if workplace:
            stmt = stmt.where(JobPost.workplace_type.in_(workplace))
        elif f.get("is_remote") is not None and skip_facet != "workplace":
            stmt = stmt.where(JobPost.is_remote == f["is_remote"])

        if types := _as_list(want("job_type")):
            stmt = stmt.where(func.lower(JobPost.job_type).in_([t.lower() for t in types]))

        if level := f.get("experience_level"):
            stmt = stmt.where(func.lower(JobPost.experience_level) == level.lower())

        for key, col in (
            ("seniority", JobPost.seniority),
            ("country", JobPost.country_code),
            ("region", JobPost.region),
            ("industry", JobPost.industry),
            ("job_function", JobPost.job_function),
            ("language", JobPost.language),
        ):
            values = _as_list(want(key))
            if values:
                if key == "country":
                    values = [v.upper() for v in values]
                stmt = stmt.where(col.in_(values))

        if companies := _as_list(want("company")):
            stmt = stmt.where(func.lower(JobPost.company_name).in_([c.lower() for c in companies]))

        if sources := _as_list(want("source")):
            stmt = stmt.where(func.upper(JobPost.source).in_([s.upper() for s in sources]))

        if days := POSTED_WITHIN.get(want("posted_within") or ""):
            stmt = stmt.where(JobPost.posted_at >= datetime.now(UTC) - timedelta(days=days))

        if since := f.get("posted_since"):
            stmt = stmt.where(JobPost.posted_at > since)

        if want("has_salary"):
            stmt = stmt.where(or_(JobPost.salary_min.is_not(None), JobPost.salary_max.is_not(None)))

        # Salary bounds compare like with like (SEARCH-01): only jobs whose salary
        # is stated in the requested currency and period. Nothing is converted.
        min_salary, max_salary = f.get("min_salary"), f.get("max_salary")
        if min_salary is not None or max_salary is not None:
            stmt = stmt.where(
                func.upper(JobPost.currency) == (f.get("salary_currency") or "").upper(),
                func.lower(JobPost.salary_period) == (f.get("salary_period") or "").lower(),
            )
        if min_salary is not None:
            stmt = stmt.where(
                or_(JobPost.salary_min >= min_salary, JobPost.salary_max >= min_salary)
            )
        if max_salary is not None:
            stmt = stmt.where(
                or_(JobPost.salary_min <= max_salary, JobPost.salary_max <= max_salary)
            )

        apply = want("apply")
        if apply == "platform":
            stmt = stmt.where(JobPost.source == "DIRECT")
        elif apply == "external":
            stmt = stmt.where(JobPost.source != "DIRECT")

        visa = want("visa_sponsorship")
        if visa is not None:
            stmt = stmt.where(JobPost.visa_sponsorship.is_(bool(visa)))

        tz = f.get("tz")
        if tz is not None:
            # Working-hours overlap: the job's UTC band within TZ_OVERLAP_HOURS of yours.
            stmt = stmt.where(
                JobPost.tz_min <= tz + TZ_OVERLAP_HOURS, JobPost.tz_max >= tz - TZ_OVERLAP_HOURS
            )

        if want("verified"):
            from app.domains.companies.models import CompanyProfile

            stmt = stmt.where(
                JobPost.company_id.in_(
                    select(CompanyProfile.id).where(CompanyProfile.is_verified.is_(True))
                )
            )

        if query := f.get("query"):
            if self._pg():
                # Same expression as the partial GIN index ix_job_posts_live_fts
                # (migration 070). websearch syntax: "exact phrase", -exclude, OR.
                stmt = stmt.where(
                    literal_column(JOB_FTS_EXPR).op("@@")(
                        func.websearch_to_tsquery(literal_column("'simple'::regconfig"), query)
                    )
                )
            else:
                for term in keyword_terms(query):
                    keyword = f"%{term}%"
                    stmt = stmt.where(
                        or_(
                            JobPost.title.ilike(keyword),
                            JobPost.description.ilike(keyword),
                            JobPost.company_name.ilike(keyword),
                            cast(JobPost.skills, Text).ilike(keyword),
                        )
                    )

        skills = [s.strip() for s in _as_list(want("skills")) if s.strip()]
        if skills:
            if self._pg():
                # jsonb ?| uses the GIN index ix_job_posts_live_skills.
                variants = sorted({v for s in skills for v in (s, s.lower(), s.title(), s.upper())})
                stmt = stmt.where(JobPost.skills.op("?|")(cast(literal(variants), ARRAY(String))))
            else:
                stmt = stmt.where(
                    or_(*[cast(JobPost.skills, Text).ilike(f'%"{s}"%') for s in skills])
                )

        return stmt

    def _ordered(self, stmt: Select, sort: str | None, query: str | None) -> Select:
        if sort == "salary":
            return stmt.order_by(
                func.coalesce(JobPost.salary_max, JobPost.salary_min).desc().nulls_last(),
                JobPost.posted_at.desc(),
                JobPost.id.desc(),
            )
        if sort == "relevant" and query and self._pg():
            rank = func.ts_rank_cd(
                literal_column(JOB_FTS_EXPR),
                func.websearch_to_tsquery(literal_column("'simple'::regconfig"), query),
            )
            return stmt.order_by(rank.desc(), JobPost.posted_at.desc(), JobPost.id.desc())
        if sort == "relevant" and query:
            first = (keyword_terms(query) or [query])[0]
            title_hit = case((JobPost.title.ilike(f"%{first}%"), 0), else_=1)
            return stmt.order_by(title_hit, JobPost.posted_at.desc(), JobPost.id.desc())
        # id breaks ties so consecutive pages never overlap or skip rows.
        return stmt.order_by(JobPost.posted_at.desc(), JobPost.id.desc())

    async def search(
        self,
        skip: int = 0,
        limit: int = 20,
        sort: str | None = None,
        after: str | None = None,
        **filters: Any,
    ) -> Sequence[JobPost]:
        stmt = self._filtered(select(JobPost), **filters)
        if sort == "relevant" and filters.get("query") and self._pg():
            # Rank only the first JOB_KEYWORD_COUNT_CAP matches the full-text index
            # yields (the set the capped total counts): ranking every match of a
            # common word computes ts_rank_cd for millions of rows (> 30 s at 10M).
            newest = self._filtered(select(JobPost.id), **filters).order_by(JobPost.posted_at.desc(), JobPost.id.desc()).limit(
                settings.JOB_KEYWORD_COUNT_CAP
            )
            stmt = select(JobPost).where(JobPost.id.in_(newest))
        cursor = parse_cursor(after) if after and sort in (None, "recent") else None
        if cursor is not None:
            # Keyset page: an index range scan from the cursor, however deep.
            stmt = stmt.where(tuple_(JobPost.posted_at, JobPost.id) < tuple_(*cursor))
            skip = 0
        stmt = self._ordered(stmt, sort, filters.get("query")).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def count(self, **filters: Any) -> int:
        """Matching live jobs. Keyword searches on PostgreSQL count at most
        JOB_KEYWORD_COUNT_CAP: counting every match of a common word rechecks the
        full-text expression on millions of rows (minutes at 10M jobs); the list
        reports the cap in X-Total-Count-Capped."""
        if filters.get("query") and self._pg():
            cap = settings.JOB_KEYWORD_COUNT_CAP
            sub = self._filtered(select(JobPost.id), **filters).order_by(JobPost.posted_at.desc(), JobPost.id.desc()).limit(cap).subquery()
            return int(await self.db.scalar(select(func.count()).select_from(sub)) or 0)
        stmt = self._filtered(select(func.count()).select_from(JobPost), **filters)
        return int(await self.db.scalar(stmt) or 0)

    async def facets(self, **filters: Any) -> dict[str, list[dict[str, Any]]]:
        """Counts per value for each filter, each computed with every *other*
        filter applied (picking "remote" still shows how many hybrid jobs there
        are). Top FACET_LIMIT values for open-ended facets.

        On PostgreSQL every facet whose own filter is not in use shares one scan
        (GROUPING SETS plus FILTERed counts for the flags); only facets the search
        filters on need a scan of their own. At millions of live jobs that is 2-4
        scans per request instead of 21 (docs/operations/capacity.md)."""
        if not self._pg():
            return await self._facets_each(**filters)
        active = _active_facets(filters)
        out: dict[str, list[dict[str, Any]]] = {}
        shared = [f for f in FACET_COLUMNS if f not in active]
        shared_flags = [f for f in FLAG_FACETS if f not in active]
        if shared or shared_flags:
            out.update(await self._facets_one_scan(filters, shared, shared_flags, skip=None))
        for facet in active:
            if facet in FACET_COLUMNS:
                out.update(await self._facets_one_scan(filters, [facet], [], skip=facet))
            elif facet in FLAG_FACETS:
                out.update(await self._facets_one_scan(filters, [], [facet], skip=facet))
        out["skills"] = await self._skill_facet(filters)
        ordered = {k: out[k] for k in (*FACET_COLUMNS, *FLAG_FACETS, "skills") if k in out}
        return ordered

    async def _facets_one_scan(
        self, filters: dict[str, Any], columns: list[str], flags: list[str], skip: str | None
    ) -> dict[str, list[dict[str, Any]]]:
        """One pass over the matching rows: GROUPING SETS over `columns` (top
        FACET_LIMIT per column) and, in the grand-total row, the flag counts."""
        now = datetime.now(UTC)
        cond: dict[str, list[tuple[Any, Any]]] = {
            "posted_within": [
                (key, JobPost.posted_at >= now - timedelta(days=days))
                for key, days in POSTED_WITHIN.items()
            ],
            "has_salary": [
                (True, or_(JobPost.salary_min.is_not(None), JobPost.salary_max.is_not(None)))
            ],
            "apply": [
                ("platform", JobPost.source == "DIRECT"),
                ("external", JobPost.source != "DIRECT"),
            ],
            "visa_sponsorship": [
                (True, JobPost.visa_sponsorship.is_(True)),
                (False, JobPost.visa_sponsorship.is_(False)),
            ],
        }
        flag_cols = [
            (facet, value, func.count().filter(c).label(f"f{i}_{j}"))
            for i, facet in enumerate(flags)
            for j, (value, c) in enumerate(cond[facet])
        ]
        cols = [FACET_COLUMNS[f] for f in columns]
        labels = [c.label(f"c{i}") for i, c in enumerate(cols)]
        group = func.grouping(*cols).label("g") if cols else literal(0).label("g")
        inner = self._filtered(
            select(*labels, group, func.count().label("n"), *[fc for _, _, fc in flag_cols]).select_from(JobPost),
            skip_facet=skip,
            **filters,
        )
        inner = self._keyword_window(inner, filters, skip)
        if cols:
            inner = inner.group_by(func.grouping_sets(*cols, text("()")))
        sub = inner.subquery()
        rank = (
            func.row_number()
            .over(partition_by=sub.c.g, order_by=(sub.c.n.desc(), *[sub.c[f"c{i}"] for i in range(len(cols))]))
            .label("r")
        )
        ranked = select(sub, rank).subquery()
        rows = (await self.db.execute(
            select(ranked).where(ranked.c.r <= FACET_LIMIT + 1)
        )).mappings().all()
        out: dict[str, list[dict[str, Any]]] = {f: [] for f in columns}
        full = (1 << len(cols)) - 1
        for row in sorted(rows, key=lambda r: r["r"]):
            g = int(row["g"] or 0)
            if cols and g == full:  # the grand-total row
                for facet, value, fc in flag_cols:
                    out.setdefault(facet, []).append({"value": value, "count": int(row[fc.name] or 0)})
                continue
            if not cols:
                for facet, value, fc in flag_cols:
                    out.setdefault(facet, []).append({"value": value, "count": int(row[fc.name] or 0)})
                continue
            # grouping() bit i (from the left) is 0 for the column this set groups by.
            i = next(k for k in range(len(cols)) if not g & (1 << (len(cols) - 1 - k)))
            value = row[f"c{i}"]
            facet = columns[i]
            if value is None or len(out[facet]) >= FACET_LIMIT:
                continue
            out[facet].append({"value": value, "count": int(row["n"] or 0)})
        return out

    def _keyword_window(self, stmt: Select, filters: dict[str, Any], skip: str | None) -> Select:
        """Keyword searches count facets among the first JOB_KEYWORD_COUNT_CAP
        matches, like the capped total (see count())."""
        if not filters.get("query"):
            return stmt
        newest = self._filtered(select(JobPost.id), skip_facet=skip, **filters).order_by(JobPost.posted_at.desc(), JobPost.id.desc()).limit(
            settings.JOB_KEYWORD_COUNT_CAP
        )
        return stmt.where(JobPost.id.in_(newest))

    async def _facets_each(self, **filters: Any) -> dict[str, list[dict[str, Any]]]:
        """Portable version (SQLite tests): one query per facet value."""
        out: dict[str, list[dict[str, Any]]] = {}
        for facet, col in FACET_COLUMNS.items():
            stmt = (
                self._filtered(
                    select(col.label("v"), func.count().label("n")).select_from(JobPost),
                    skip_facet=facet,
                    **filters,
                )
                .where(col.is_not(None))
                .group_by(col)
                .order_by(func.count().desc(), col)
                .limit(FACET_LIMIT)
            )
            rows: Any = (await self.db.execute(stmt)).all()
            out[facet] = [{"value": v, "count": int(n or 0)} for v, n in rows]
        now = datetime.now(UTC)
        base = self._filtered(
            select(func.count()).select_from(JobPost), skip_facet="posted_within", **filters
        )
        posted = []
        for key, days in POSTED_WITHIN.items():
            n = await self.db.scalar(base.where(JobPost.posted_at >= now - timedelta(days=days)))
            posted.append({"value": key, "count": int(n or 0)})
        out["posted_within"] = posted
        flags: list[tuple[str, Any, Any]] = [
            (
                "has_salary",
                True,
                or_(JobPost.salary_min.is_not(None), JobPost.salary_max.is_not(None)),
            ),
            ("apply", "platform", JobPost.source == "DIRECT"),
            ("apply", "external", JobPost.source != "DIRECT"),
            ("visa_sponsorship", True, JobPost.visa_sponsorship.is_(True)),
            ("visa_sponsorship", False, JobPost.visa_sponsorship.is_(False)),
        ]
        for facet, value, cond in flags:
            q = self._filtered(
                select(func.count()).select_from(JobPost), skip_facet=facet, **filters
            )
            n = await self.db.scalar(q.where(cond))
            out.setdefault(facet, []).append({"value": value, "count": int(n or 0)})
        out["skills"] = await self._skill_facet(filters)
        return out

    async def _skill_facet(self, filters: dict[str, Any]) -> list[dict[str, Any]]:
        if self._pg():
            sub = self._keyword_window(
                self._filtered(select(JobPost.skills), skip_facet="skills", **filters), filters, "skills"
            ).subquery()
            elem = func.jsonb_array_elements_text(sub.c.skills).table_valued("value").alias("s")
            stmt = (
                select(elem.c.value, func.count())
                .select_from(sub)
                .join(elem, literal(True))
                .group_by(elem.c.value)
                .order_by(func.count().desc(), elem.c.value)
                .limit(FACET_LIMIT)
            )
            skill_rows: Any = (await self.db.execute(stmt)).all()
            return [{"value": v, "count": int(n or 0)} for v, n in skill_rows]
        stmt = self._filtered(select(JobPost.skills), skip_facet="skills", **filters).limit(5000)
        counts: dict[str, int] = {}
        all_skills: Any = (await self.db.execute(stmt)).all()
        for (skills,) in all_skills:
            for s in skills or []:
                counts[s] = counts.get(s, 0) + 1
        ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:FACET_LIMIT]
        return [{"value": v, "count": n} for v, n in ranked]


    # --- SEO landing pages and search-engine notifications -------------------

    async def landing_stats(self, **filters: Any) -> dict[str, Any]:
        """Real aggregates for a landing page's intro (no invented numbers): how
        many live jobs match, how many arrived in the last 7 days, the employers
        with most openings, and the published pay range in the most common
        currency and period (only jobs that state one)."""
        total = await self.count(**filters)
        week = datetime.now(UTC) - timedelta(days=7)
        recent = await self.count(**filters, posted_since=week)
        companies: Sequence[Any] = (
            await self.db.execute(
                self._keyword_window(
                    self._filtered(select(JobPost.company_name, func.count().label("n")), **filters),
                    filters,
                    None,
                )
                .group_by(JobPost.company_name)
                .order_by(func.count().desc(), JobPost.company_name.asc())
                .limit(5)
            )
        ).all()
        salary_rows: Sequence[Any] = (
            await self.db.execute(
                self._filtered(
                    select(
                        JobPost.salary_min,
                        JobPost.salary_max,
                        JobPost.currency,
                        JobPost.salary_period,
                        JobPost.seniority,
                    ),
                    **filters,
                )
                .where(
                    JobPost.currency.is_not(None),
                    JobPost.salary_period.is_not(None),
                    or_(JobPost.salary_min.is_not(None), JobPost.salary_max.is_not(None)),
                    *([] if not filters.get("query") else [JobPost.id.in_(
                        self._filtered(select(JobPost.id), **filters).order_by(JobPost.posted_at.desc(), JobPost.id.desc()).limit(settings.JOB_KEYWORD_COUNT_CAP)
                    )]),
                )
                .order_by(JobPost.posted_at.desc())
                .limit(2000)
            )
        ).all()
        # The newest matching jobs (bounded) for skills and the weekly trend.
        recent_rows: Sequence[Any] = (
            await self.db.execute(
                self._filtered(select(JobPost.skills, JobPost.posted_at), **filters)
                .order_by(JobPost.posted_at.desc())
                .limit(2000)
            )
        ).all()
        return {
            "total": total,
            "new_last_7_days": recent,
            "top_companies": [{"name": n, "count": int(c)} for n, c in companies if n],
            "salary": salary_summary([r[:4] for r in salary_rows]),
            "salary_by_seniority": salary_by_seniority(salary_rows),
            "top_skills": top_skills([r[0] for r in recent_rows]),
            "weekly_new": weekly_counts([r[1] for r in recent_rows]),
        }

    async def employers(
        self, min_jobs: int = 1, limit: int = 2000, is_remote: bool | None = True
    ) -> list[dict[str, Any]]:
        """Employers with live jobs, most openings first, with a URL slug. Remote
        employers come from job_employer_stats (rebuilt by Celery) once it has been
        filled; the live GROUP BY is the fallback."""
        if is_remote is True and await self._employer_stats_ready():
            stat_rows = (
                await self.db.execute(
                    select(JobEmployerStat)
                    .where(JobEmployerStat.job_count >= min_jobs)
                    .order_by(JobEmployerStat.job_count.desc(), JobEmployerStat.name.asc())
                    .limit(limit)
                )
            ).scalars().all()
            return [_employer_out(e) for e in stat_rows]
        return await self.employers_live(min_jobs=min_jobs, limit=limit, is_remote=is_remote)

    async def employers_live(
        self, min_jobs: int = 1, limit: int = 2000, is_remote: bool | None = True
    ) -> list[dict[str, Any]]:
        rows: Sequence[Any] = (
            await self.db.execute(
                self._filtered(
                    select(
                        JobPost.company_name,
                        func.count().label("n"),
                        func.max(JobPost.posted_at).label("latest"),
                    ),
                    is_remote=is_remote,
                )
                .group_by(JobPost.company_name)
                .having(func.count() >= min_jobs)
                .order_by(func.count().desc(), JobPost.company_name.asc())
                .limit(limit)
            )
        ).all()
        out: list[dict[str, Any]] = []
        seen: set[str] = set()
        for name, n, latest in rows:
            slug = employer_slug(name or "")
            if not slug or slug in seen:  # two spellings of one name: keep the bigger
                continue
            seen.add(slug)
            out.append({"slug": slug, "name": name, "count": int(n), "latest_posted_at": latest})
        return out

    async def employer_by_slug(self, slug: str) -> dict[str, Any] | None:
        if await self._employer_stats_ready():
            row = await self.db.get(JobEmployerStat, slug)
            return _employer_out(row) if row else None
        for e in await self.employers_live(min_jobs=1, limit=20000):
            if e["slug"] == slug:
                return e
        return None

    async def _employer_stats_ready(self) -> bool:
        return await self.stored_stat(
            "employers:ready", timedelta(minutes=settings.JOB_STATS_REFRESH_MINUTES * 3)
        ) is not None

    async def refresh_employer_stats(self) -> int:
        """Rebuild job_employer_stats from the live remote catalogue in one
        transaction (readers see the old rows until it commits)."""
        if self._pg():
            await self.db.execute(text("SELECT pg_advisory_xact_lock(7241093552)"))
        rows = await self.employers_live(min_jobs=1, limit=settings.JOB_EMPLOYER_STATS_MAX, is_remote=True)
        await self.db.execute(delete(JobEmployerStat))
        for i in range(0, len(rows), 5000):
            self.db.add_all(
                JobEmployerStat(
                    slug=r["slug"], name=r["name"][:255], job_count=r["count"],
                    latest_posted_at=r["latest_posted_at"],
                )
                for r in rows[i : i + 5000]
            )
            await self.db.flush()
        await self.store_stat("employers:ready", {"count": len(rows)})
        return len(rows)

    async def stored_stat(self, key: str, max_age: timedelta) -> dict[str, Any] | None:
        row = await self.db.get(JobCatalogueStat, key)
        if row is None:
            return None
        at = row.computed_at if row.computed_at.tzinfo else row.computed_at.replace(tzinfo=UTC)
        return row.payload if datetime.now(UTC) - at <= max_age else None

    async def store_stat(self, key: str, payload: dict[str, Any]) -> None:
        if self._pg():
            from sqlalchemy.dialects.postgresql import insert

            stmt = insert(JobCatalogueStat).values(key=key, payload=payload, computed_at=datetime.now(UTC))
            await self.db.execute(stmt.on_conflict_do_update(
                index_elements=[JobCatalogueStat.key],
                set_={"payload": stmt.excluded.payload, "computed_at": stmt.excluded.computed_at},
            ))
            await self.db.commit()
            return
        row = await self.db.get(JobCatalogueStat, key)
        if row is None:
            self.db.add(JobCatalogueStat(key=key, payload=payload, computed_at=datetime.now(UTC)))
        else:
            row.payload = payload
            row.computed_at = datetime.now(UTC)
        await self.db.commit()

    async def availability(self, job_id: uuid.UUID) -> str | None:
        """'live', 'expired' (recently; the page still helps visitors) or 'gone'
        (removed, hidden, or expired/posted long ago: the page answers 410).
        None when no such job exists."""
        row = (
            await self.db.execute(
                select(
                    JobPost.is_active, JobPost.is_deleted, JobPost.expired_at, JobPost.posted_at
                ).where(JobPost.id == job_id)
            )
        ).first()
        if row is None:
            return None
        active, deleted, expired_at, posted_at = row
        now = datetime.now(UTC)

        def older(ts: datetime | None, days: int) -> bool:
            if ts is None:
                return False
            ts = ts if ts.tzinfo else ts.replace(tzinfo=UTC)
            return ts < now - timedelta(days=days)

        if deleted or not active:
            return "gone"
        if expired_at is not None:
            return "gone" if older(expired_at, settings.JOB_GONE_AFTER_DAYS) else "expired"
        if older(posted_at, settings.SITEMAP_JOB_MAX_AGE_DAYS + settings.JOB_GONE_AFTER_DAYS):
            return "gone"
        return "live"

    async def indexable_newest_first(self, job_ids: list[uuid.UUID]) -> list[uuid.UUID]:
        """The subset of `job_ids` whose pages may appear in Google (syndication-
        eligible source, live, inside the sitemap window), newest posting first:
        the shared Indexing API budget goes to the freshest indexable pages and
        none is spent on pages that answer noindex."""
        if not job_ids:
            return []
        out: list[uuid.UUID] = []
        for i in range(0, len(job_ids), 500):
            chunk = job_ids[i : i + 500]
            stmt = self._filtered(select(JobPost.id, JobPost.posted_at)).where(
                JobPost.id.in_(chunk), *self._sitemap_scope()
            )
            out.extend(r[0] for r in (await self.db.execute(stmt)).all())
        posted = (
            {
                r[0]: r[1]
                for r in (
                    await self.db.execute(
                        select(JobPost.id, JobPost.posted_at).where(JobPost.id.in_(out))
                    )
                ).all()
            }
            if out
            else {}
        )
        return sorted(out, key=lambda i: (posted.get(i) or datetime.min, str(i)), reverse=True)

    async def syndicated(self, job_ids: list[uuid.UUID]) -> list[uuid.UUID]:
        """The subset of `job_ids` from sources whose pages Google may have indexed."""
        if not job_ids:
            return []
        stmt = select(JobPost.id).where(
            JobPost.id.in_(job_ids), JobPost.source.not_in(SEARCH_SYNDICATION_BLOCKED_SOURCES)
        )
        keep = {r[0] for r in (await self.db.execute(stmt)).all()}
        return [i for i in job_ids if i in keep]


def _employer_out(e: JobEmployerStat) -> dict[str, Any]:
    return {"slug": e.slug, "name": e.name, "count": e.job_count, "latest_posted_at": e.latest_posted_at}


def employer_slug(name: str) -> str:
    """URL slug for an employer name ("Acme, Inc." -> "acme-inc")."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:80].strip("-")


def salary_summary(rows: Sequence[Any]) -> dict[str, Any] | None:
    """Pay range in the most common (currency, period) among rows of
    (salary_min, salary_max, currency, period). Each job contributes its
    midpoint; nothing is converted between currencies or periods."""
    groups: dict[tuple[str, str], list[float]] = {}
    for lo, hi, currency, period in rows:
        values = [float(v) for v in (lo, hi) if v is not None and float(v) > 0]
        if not values:
            continue
        key = (str(currency).upper(), str(period).lower())
        groups.setdefault(key, []).append(sum(values) / len(values))
    if not groups:
        return None
    (currency, period), mids = max(groups.items(), key=lambda kv: len(kv[1]))
    mids.sort()

    def pct(p: float) -> float:
        return round(mids[min(len(mids) - 1, int(p * (len(mids) - 1) + 0.5))])

    return {
        "currency": currency,
        "period": period,
        "count": len(mids),
        "low": pct(0.1),
        "median": pct(0.5),
        "high": pct(0.9),
    }


SENIORITY_ORDER = ("intern", "junior", "mid", "senior", "lead", "staff", "principal", "executive")


def salary_by_seniority(rows: Sequence[Any]) -> list[dict[str, Any]]:
    """Pay per seniority level, from rows of (min, max, currency, period, seniority),
    all in the overall most common currency and period so levels compare. A level
    needs at least 3 published salaries to be shown."""
    overall = salary_summary([r[:4] for r in rows])
    if not overall:
        return []
    by_level: dict[str, list[Any]] = {}
    for lo, hi, currency, period, level in rows:
        if not level or str(currency).upper() != overall["currency"]:
            continue
        if str(period).lower() != overall["period"]:
            continue
        by_level.setdefault(str(level).lower(), []).append((lo, hi, currency, period))
    out = []
    for level, items in by_level.items():
        s = salary_summary(items)
        if s and s["count"] >= 3:
            out.append({"seniority": level, **s})
    rank = {v: i for i, v in enumerate(SENIORITY_ORDER)}
    return sorted(out, key=lambda r: rank.get(r["seniority"], len(rank)))


def top_skills(skill_lists: Sequence[Any], limit: int = 10) -> list[dict[str, Any]]:
    """The skills most often listed by the given jobs (each job counts once)."""
    counts: dict[str, int] = {}
    for skills in skill_lists:
        for s in {str(x) for x in (skills or []) if x}:
            counts[s] = counts.get(s, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0].lower()))[:limit]
    return [{"name": k, "count": v} for k, v in ranked if v >= 2]


def weekly_counts(dates: Sequence[Any], weeks: int = 4) -> list[int]:
    """Jobs posted in each of the last `weeks` 7-day windows, oldest first."""
    now = datetime.now(UTC)
    out = [0] * weeks
    for d in dates:
        if d is None:
            continue
        if d.tzinfo is None:
            d = d.replace(tzinfo=UTC)
        age = (now - d).days // 7
        if 0 <= age < weeks:
            out[weeks - 1 - age] += 1
    return out

def job_cursor(job: Any) -> str:
    """Opaque-enough keyset cursor for the job after which the next page starts."""
    posted = job["posted_at"] if isinstance(job, dict) else job.posted_at.isoformat()
    ident = job["id"] if isinstance(job, dict) else job.id
    return f"{posted},{ident}"


def parse_cursor(value: str) -> tuple[datetime, uuid.UUID] | None:
    try:
        posted, ident = value.rsplit(",", 1)
        ts = datetime.fromisoformat(posted)
        return (ts if ts.tzinfo else ts.replace(tzinfo=UTC)), uuid.UUID(ident)
    except ValueError:
        return None


def _as_list(value: Any) -> list[Any]:
    if value is None or value == "":
        return []
    return list(value) if isinstance(value, list | tuple | set) else [value]


def keyword_terms(query: str) -> list[str]:
    """SQLite fallback for websearch syntax: quoted phrases stay whole, other
    words must each appear."""
    phrases = re.findall(r'"([^"]+)"', query)
    rest = re.sub(r'"[^"]*"', " ", query).split()
    return [p.strip() for p in phrases if p.strip()] + [w for w in rest if w.upper() != "OR"]


POSTED_WITHIN = {"24h": 1, "3d": 3, "7d": 7, "30d": 30, "90d": 90}
TZ_OVERLAP_HOURS = 3
FACET_LIMIT = 30
FACET_COLUMNS = {
    "workplace": JobPost.workplace_type,
    "job_type": JobPost.job_type,
    "seniority": JobPost.seniority,
    "country": JobPost.country_code,
    "region": JobPost.region,
    "industry": JobPost.industry,
    "job_function": JobPost.job_function,
    "language": JobPost.language,
    "source": JobPost.source,
    "company": JobPost.company_name,
}
# Facets counted as on/off flags, not GROUP BY values.
FLAG_FACETS = ("posted_within", "has_salary", "apply", "visa_sponsorship")


def _active_facets(filters: dict[str, Any]) -> list[str]:
    """Facets whose own filter is set (their counts need that filter left out).
    workplace also covers is_remote, which skip_facet="workplace" drops too."""
    out = [f for f in (*FACET_COLUMNS, *FLAG_FACETS) if filters.get(f) not in (None, "", [])]
    if "workplace" not in out and filters.get("is_remote") is not None:
        out.insert(0, "workplace")
    return out


FILTER_KEYS = frozenset(
    {
        "query", "skills", "is_remote", "job_type", "experience_level", "min_salary",
        "max_salary", "salary_currency", "salary_period", "source", "company_id", "location",
        "workplace", "seniority", "country", "region", "industry", "job_function", "language",
        "company", "posted_within", "has_salary", "apply", "visa_sponsorship", "tz", "verified", "posted_since", "employer",
    }
)  # fmt: skip
