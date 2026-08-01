"""
Admin Domain Repository — Activity Logs and Sync Audits.
"""

import uuid
from typing import Optional, Sequence
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.admin.models import ActivityLog, ApiSyncLog


class AdminRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def log_activity(
        self,
        user_id: Optional[uuid.UUID],
        action: str,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        details: Optional[dict] = None,
    ) -> ActivityLog:
        entry = ActivityLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details or {},
        )
        self.db.add(entry)
        await self.db.flush()
        return entry

    async def log_sync(
        self,
        source: str,
        jobs_fetched: int,
        jobs_inserted: int,
        jobs_updated: int,
        status: str = "SUCCESS",
        error_message: Optional[str] = None,
        duration_ms: int = 0,
    ) -> ApiSyncLog:
        entry = ApiSyncLog(
            source=source,
            jobs_fetched=jobs_fetched,
            jobs_inserted=jobs_inserted,
            jobs_updated=jobs_updated,
            status=status,
            error_message=error_message,
            duration_ms=duration_ms,
        )
        self.db.add(entry)
        await self.db.flush()
        return entry

    async def list_recent_syncs(self, limit: int = 50) -> Sequence[ApiSyncLog]:
        stmt = select(ApiSyncLog).order_by(ApiSyncLog.created_at.desc()).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def list_activity_logs(self, limit: int = 50) -> Sequence[ActivityLog]:
        stmt = select(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()
