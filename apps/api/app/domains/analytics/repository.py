"""
Analytics Domain Repository.
"""

import uuid
from datetime import date
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.analytics.models import AnalyticsEvent


class AnalyticsRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def record_event(
        self,
        event_name: str,
        user_id: uuid.UUID | None,
        properties: dict[str, Any] | None = None,
    ) -> AnalyticsEvent:
        entry = AnalyticsEvent(
            event_name=event_name,
            user_id=user_id,
            properties=properties or {},
        )
        self.db.add(entry)
        await self.db.flush()
        return entry

    async def summary_by_event_and_day(self) -> list[tuple[str, date, int]]:
        """Event counts grouped by event_name and calendar day, most recent first."""
        day_col = func.date(AnalyticsEvent.created_at)
        stmt = (
            select(day_col.label("day"), AnalyticsEvent.event_name, func.count(AnalyticsEvent.id))
            .group_by(day_col, AnalyticsEvent.event_name)
            .order_by(day_col.desc(), AnalyticsEvent.event_name.asc())
        )
        result = await self.db.execute(stmt)
        return [(event_name, day, count) for day, event_name, count in result.all()]
