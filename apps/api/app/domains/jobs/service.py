"""
Service layer for Job Post domain & Aggregator coordination.
"""

import json
import time
import uuid
from collections.abc import Sequence

from app.agents.job_enricher import JobEnricherAgent
from app.agents.llm_client import AIProviderError
from app.core.config import settings
from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.domains.admin.repository import AdminRepository
from app.domains.jobs import list_cache
from app.domains.jobs.aggregators.arbeitnow import ArbeitnowAggregator
from app.domains.jobs.aggregators.base import SourceDisabledError, SourceFetchError
from app.domains.jobs.aggregators.public_boards import (
    AdzunaAggregator,
    AshbyAggregator,
    GreenhouseAggregator,
    HimalayasAggregator,
    JobicyAggregator,
    JoobleAggregator,
    LeverAggregator,
    SmartRecruitersAggregator,
    WorkingNomadsAggregator,
)
from app.domains.jobs.aggregators.remoteok import RemoteOKAggregator
from app.domains.jobs.aggregators.remotive import RemotiveAggregator
from app.domains.jobs.aggregators.themuse import TheMuseAggregator
from app.domains.jobs.aggregators.usajobs import USAJobsAggregator
from app.domains.jobs.models import JobPost
from app.domains.jobs.repository import JobRepository
from app.domains.jobs.schemas import JobPostCreate, JobPostResponse, JobPostUpdate, JobSearchQuery
from app.domains.marketplace.models import AIReport
from app.services.search.indexing import notify_new_jobs

logger = get_logger("jobs.service")

# The configured job sources. Ingestion health reports every one of these, so a
# source that never succeeds or stops logging cannot disappear from view (OBS-01).
AGGREGATORS = (
    RemoteOKAggregator,
    ArbeitnowAggregator,
    RemotiveAggregator,
    TheMuseAggregator,
    USAJobsAggregator,
    JobicyAggregator,
    HimalayasAggregator,
    WorkingNomadsAggregator,
    GreenhouseAggregator,
    LeverAggregator,
    AshbyAggregator,
    SmartRecruitersAggregator,
    AdzunaAggregator,
    JoobleAggregator,
)


class JobService:
    def __init__(self, repo: JobRepository):
        self.repo = repo
        self.aggregators = [cls() for cls in AGGREGATORS]

    async def get_by_id(self, job_id: uuid.UUID) -> JobPost:
        job = await self.repo.get_by_id(job_id)
        if not job:
            raise NotFoundError("Job post not found")
        return job

    async def get_by_slug(self, slug: str) -> JobPost:
        job = await self.repo.get_by_slug(slug)
        if not job:
            raise NotFoundError("Job post not found")
        return job

    async def create_job(self, data: JobPostCreate) -> JobPost:
        if not data.company_name:
            raise ValueError("company_name is required to create a job post")
        job = await self.repo.create(data)
        try:
            analysis = await JobEnricherAgent().enrich_job(job.title, job.description)
            job.ai_analysis = {
                "status": "completed",
                "improved_description": analysis.get("summary", job.description),
                "required_skills": analysis.get("skills", []),
                "technology_stack": analysis.get("tech_stack", []),
                "difficulty_level": analysis.get("experience_level") or job.experience_level,
                "estimated_timeline": analysis.get("estimated_timeline"),
                "milestones": analysis.get("milestones", []),
                "tasks": analysis.get("tasks", []),
            }
            self.repo.db.add(
                AIReport(job_id=job.id, report_type="job_analysis", payload=job.ai_analysis)
            )
        except AIProviderError as exc:
            # Never fail job creation just because AI enrichment is down (the job post itself
            # is already valid and stored) -- but never fake the analysis either: record an
            # honest "unavailable" status rather than writing placeholder skills/experience
            # data that would look like a real AI extraction.
            logger.warning(
                "Job AI enrichment failed; job created without AI analysis",
                job_id=str(job.id),
                error=str(exc),
            )
            job.ai_analysis = {
                "status": "unavailable",
                "error": "AI enrichment temporarily unavailable; please retry analysis later.",
            }
        await self.repo.db.flush()
        await self.repo.db.refresh(job)
        return job

    async def update_job(self, job_id: uuid.UUID, data: JobPostUpdate) -> JobPost:
        job = await self.repo.update(job_id, data)
        if not job:
            raise NotFoundError("Job post not found")
        return job

    async def search_jobs(self, query: JobSearchQuery) -> Sequence[JobPost]:
        return await self.repo.search(**query.filters(), skip=query.skip, limit=query.limit)

    async def search_jobs_cached(self, query: JobSearchQuery) -> tuple[list[dict], int]:
        """One page of matching jobs plus the total number of matches."""
        key = json.dumps(query.model_dump(mode="json"), sort_keys=True)
        cached = list_cache.get(key)
        if cached is not None:
            return cached
        jobs = await self.search_jobs(query)
        total = await self.repo.count(**query.filters())
        serialized = [JobPostResponse.model_validate(job).model_dump(mode="json") for job in jobs]
        list_cache.put(key, (serialized, total))
        return serialized, total

    async def maintain_catalogue(self) -> dict[str, int]:
        """Retention after imports: drop imported jobs older than JOB_RETENTION_DAYS (hide
        them if someone applied), then trim to the database size budget."""
        removed, hidden = await self.repo.purge_old_imported_jobs(settings.JOB_RETENTION_DAYS)
        removed += await self.repo.trim_to_size_budget(settings.DATABASE_SIZE_BUDGET_MB)
        await self.repo.db.commit()
        if removed or hidden:
            logger.info(
                f"Retention: removed {removed} old imported jobs, hid {hidden} with applications"
            )
        return {"retention_removed": removed, "retention_hidden": hidden}

    async def sync_all_job_sources(
        self,
        limit_per_source: int = 50,
        admin_repo: AdminRepository | None = None,
        source_name: str | None = None,
        run_maintenance: bool = True,
    ) -> dict[str, int]:
        """
        Runs job aggregation across every configured source, saving/upserting jobs to DB.
        If `admin_repo` is given, records a per-source ApiSyncLog entry (fetched/inserted/
        updated/status/duration) so the admin status page reflects every sync run.
        If `source_name` is given, only that source is synced (case-insensitive match
        against each aggregator's `source_name`); an unknown name is a no-op.
        """
        logger.info(f"Starting job aggregation sync across {len(self.aggregators)} sources...")
        stats: dict[str, int] = {}
        new_job_ids: list[uuid.UUID] = []

        aggregators = self.aggregators
        if source_name is not None:
            aggregators = [
                a for a in self.aggregators if a.source_name.lower() == source_name.lower()
            ]

        for aggregator in aggregators:
            started = time.monotonic()
            try:
                fetched_jobs = await aggregator.fetch_jobs(limit=limit_per_source)
                inserted = updated = 0
                skipped = 0
                for job_data in fetched_jobs:
                    # One bad posting (e.g. a field the database rejects) is skipped,
                    # never allowed to roll back the whole source.
                    try:
                        async with self.repo.db.begin_nested():
                            saved, created = await self.repo.upsert_external_job(job_data)
                    except Exception as exc:
                        skipped += 1
                        if skipped <= 3:
                            logger.warning(
                                f"Skipped one {aggregator.source_name} job: {type(exc).__name__}",
                                external_id=job_data.external_id,
                            )
                        continue
                    if created:
                        new_job_ids.append(saved.id)
                    inserted += int(created)
                    updated += int(not created)
                # Only after a successful, non-empty fetch: an outage or a feed that
                # suddenly answers with nothing must not expire a whole source (ING-01).
                expired = (
                    await self.repo.expire_unseen_jobs(aggregator.source_name)
                    if fetched_jobs
                    else 0
                )
                await self.repo.db.commit()
                stats[aggregator.source_name] = inserted + updated
                if expired:
                    logger.info(f"Expired {expired} {aggregator.source_name} jobs no longer listed")
                if not fetched_jobs:
                    logger.warning(
                        f"{aggregator.source_name} answered with no jobs; expiry skipped"
                    )
                logger.info(
                    f"Aggregated {aggregator.source_name}: {inserted} new, {updated} updated"
                )
                status, error = "SUCCESS", None
            except SourceDisabledError as e:
                logger.info(f"{aggregator.source_name} not configured, skipped: {e}")
                stats[aggregator.source_name] = 0
                inserted = updated = 0
                fetched_jobs = []
                status, error = "DISABLED", str(e)
            except Exception as e:
                await self.repo.db.rollback()
                # SourceFetchError messages are already a redacted category; for
                # anything else keep only the class name (no bodies, no DSNs).
                error = str(e) if isinstance(e, SourceFetchError) else type(e).__name__
                logger.error(f"Error aggregating jobs from {aggregator.source_name}: {error}")
                stats[aggregator.source_name] = 0
                inserted = updated = 0
                fetched_jobs = []
                status = "FAILED"
            if admin_repo:
                await admin_repo.log_sync(
                    source=aggregator.source_name,
                    jobs_fetched=len(fetched_jobs),
                    jobs_inserted=inserted,
                    jobs_updated=updated,
                    status=status,
                    error_message=error,
                    duration_ms=int((time.monotonic() - started) * 1000),
                )
                # Per source, so a later source's rollback cannot drop this record.
                await admin_repo.db.commit()

        if run_maintenance:
            await self.maintain_catalogue()
        # Newest first: the per-run Google quota goes to the freshest listings.
        sent = await notify_new_jobs(list(reversed(new_job_ids)))
        if any(sent.values()):
            logger.info(f"Search engines notified: {sent}")
        return stats
