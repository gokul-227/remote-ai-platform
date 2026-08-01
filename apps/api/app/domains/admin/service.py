"""
Service layer for Admin domain.
"""

from typing import Dict, Any, List, Sequence
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.admin.models import ApiSyncLog
from app.domains.admin.repository import AdminRepository
from app.domains.admin.schemas import PlatformStatsResponse
from app.domains.auth.models import User, UserRole
from app.domains.engineers.models import EngineerProfile
from app.domains.companies.models import CompanyProfile
from app.domains.jobs.models import JobPost
from app.domains.matching.models import JobMatch


class AdminService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = AdminRepository(db)

    async def get_platform_stats(self) -> PlatformStatsResponse:
        total_users = (await self.db.execute(select(func.count(User.id)))).scalar_one() or 0
        total_engineers = (await self.db.execute(select(func.count(EngineerProfile.id)))).scalar_one() or 0
        total_companies = (await self.db.execute(select(func.count(CompanyProfile.id)))).scalar_one() or 0
        total_jobs = (await self.db.execute(select(func.count(JobPost.id)))).scalar_one() or 0
        total_active_jobs = (
            await self.db.execute(select(func.count(JobPost.id)).where(JobPost.is_active == True))
        ).scalar_one() or 0
        total_matches = (await self.db.execute(select(func.count(JobMatch.id)))).scalar_one() or 0

        # Breakdown by source
        stmt_sources = select(JobPost.source, func.count(JobPost.id)).group_by(JobPost.source)
        res_sources = await self.db.execute(stmt_sources)
        sources_breakdown = {row[0]: row[1] for row in res_sources.all()}

        return PlatformStatsResponse(
            total_users=total_users,
            total_engineers=total_engineers,
            total_companies=total_companies,
            total_jobs=total_jobs,
            total_active_jobs=total_active_jobs,
            total_matches=total_matches,
            job_sources_breakdown=sources_breakdown,
        )

    async def get_recent_syncs(self, limit: int = 50) -> Sequence[ApiSyncLog]:
        """Recent job-aggregator sync runs, most recent first — powers the admin status page."""
        return await self.repo.list_recent_syncs(limit=limit)
