"""
Analytics Domain Service.
"""

import uuid
from typing import Any

import structlog
from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import PlatformException
from app.domains.analytics.models import AnalyticsEvent
from app.domains.analytics.repository import AnalyticsRepository
from app.domains.analytics.schemas import (
    EVENT_NAMES,
    MAX_PROPERTIES_KEYS,
    MAX_PROPERTY_VALUE_LENGTH,
    AnalyticsSummaryResponse,
    FunnelSummaryRow,
)

logger = structlog.get_logger(__name__)


def _sanitize_properties(properties: dict[str, Any]) -> dict[str, Any]:
    """Keep properties minimal: cap key count and coerce/trim values.

    Defensive only — this is an unauthenticated-callable endpoint, so a
    malformed or oversized payload must not be able to bloat storage or
    smuggle unbounded data through as "properties".
    """
    clean: dict[str, Any] = {}
    for key, value in list(properties.items())[:MAX_PROPERTIES_KEYS]:
        if not isinstance(key, str):
            continue
        if isinstance(value, str):
            clean[key[:100]] = value[:MAX_PROPERTY_VALUE_LENGTH]
        elif isinstance(value, int | float | bool) or value is None:
            clean[key[:100]] = value
        else:
            # Drop nested/complex values rather than silently serializing
            # arbitrary objects that might carry more context than intended.
            continue
    return clean


class AnalyticsService:
    def __init__(self, repository: AnalyticsRepository):
        self.repository = repository

    async def record_event(
        self,
        event_name: str,
        user_id: uuid.UUID | None,
        properties: dict[str, Any] | None = None,
    ) -> AnalyticsEvent:
        if event_name not in EVENT_NAMES:
            raise PlatformException(
                f"Unknown event_name '{event_name}'. Must be one of: {sorted(EVENT_NAMES)}",
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "INVALID_EVENT_NAME",
            )
        clean_properties = _sanitize_properties(properties or {})
        return await self.repository.record_event(event_name, user_id, clean_properties)

    async def get_funnel_summary(self) -> AnalyticsSummaryResponse:
        rows = await self.repository.summary_by_event_and_day()
        return AnalyticsSummaryResponse(
            rows=[
                FunnelSummaryRow(event_name=event_name, day=str(day), count=count)
                for event_name, day, count in rows
            ]
        )


async def emit_analytics_event(
    db: AsyncSession,
    event_name: str,
    user_id: uuid.UUID | None,
    properties: dict[str, Any] | None = None,
) -> None:
    """Fire-and-forget helper for server-side (backend-automatic) funnel
    events — e.g. signup_completed, application_submitted, project_created,
    message_sent — emitted directly from the domain code that already knows
    the event happened, rather than relying on the frontend to report it.

    Deliberately swallows unknown event names / persistence errors so a
    typo or a transient issue in analytics can never break the caller's
    actual action (registering a user, submitting an application, etc.).
    """
    if event_name not in EVENT_NAMES:
        return
    try:
        # Isolated in a SAVEPOINT: if recording the event fails for any
        # reason, only this nested transaction rolls back — the caller's
        # own (already in-flight) transaction and its eventual commit are
        # unaffected, so analytics can never break the user's real action.
        async with db.begin_nested():
            service = AnalyticsService(AnalyticsRepository(db))
            await service.record_event(event_name, user_id, properties)
    except Exception as exc:
        logger.warning("Failed to record analytics event", event_name=event_name, error=str(exc))
