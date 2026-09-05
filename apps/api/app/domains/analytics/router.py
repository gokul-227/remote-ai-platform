"""
API Router for Analytics Domain — first-party activation funnel tracking.

Two endpoints only:
  - POST /analytics/events         public ingestion, optional auth
  - GET  /analytics/events/summary admin-only funnel visibility

No third-party analytics vendor is involved; events are stored in this
app's own database (see `app/domains/analytics/models.py`).
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.analytics.repository import AnalyticsRepository
from app.domains.analytics.schemas import (
    AnalyticsEventCreate,
    AnalyticsEventResponse,
    AnalyticsSummaryResponse,
)
from app.domains.analytics.service import AnalyticsService
from app.domains.auth.dependencies import get_optional_user, require_role
from app.domains.auth.models import User, UserRole

router = APIRouter(prefix="/analytics", tags=["Analytics"])


async def get_analytics_service(db: AsyncSession = Depends(get_db)) -> AnalyticsService:
    return AnalyticsService(AnalyticsRepository(db))


@router.post(
    "/events",
    response_model=AnalyticsEventResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_event(
    data: AnalyticsEventCreate,
    current_user: User | None = Depends(get_optional_user),
    service: AnalyticsService = Depends(get_analytics_service),
) -> AnalyticsEventResponse:
    """Ingest a single funnel event.

    `user_id` is never accepted from the client — it is derived solely from
    the bearer token (null for unauthenticated visitors), so a caller cannot
    attribute events to another user's account.
    """
    event = await service.record_event(
        event_name=data.event_name,
        user_id=current_user.id if current_user else None,
        properties=data.properties,
    )
    return AnalyticsEventResponse.model_validate(event)


@router.get("/events/summary", response_model=AnalyticsSummaryResponse)
async def get_events_summary(
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    service: AnalyticsService = Depends(get_analytics_service),
) -> AnalyticsSummaryResponse:
    """Event counts grouped by event_name and calendar day (Admin only).

    A minimal, first-party substitute for a BI dashboard: enough to see
    where users drop off in the activation funnel without a third-party
    analytics vendor.
    """
    return await service.get_funnel_summary()
