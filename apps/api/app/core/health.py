"""
Health check router — always available.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse, include_in_schema=False)
async def health_check(db: AsyncSession = Depends(get_db)):
    """
    Health check endpoint — verifies API and DB connectivity.
    Used by Docker Compose healthcheck and load balancer.
    """
    services = {}

    # Check database
    try:
        await db.execute(text("SELECT 1"))
        services["database"] = "ok"
    except Exception as e:
        services["database"] = f"error: {str(e)[:50]}"

    return HealthResponse(
        status="ok",
        version=settings.APP_VERSION,
        environment=settings.APP_ENV,
        services=services,
    )
