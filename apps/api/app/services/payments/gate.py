"""Server-side gate for every endpoint that funds or releases money."""

from fastapi import HTTPException, status

from app.core.config import settings

PAYMENTS_DISABLED_DETAIL = (
    "Payments through Remote AI Platform are not available yet. "
    "No money has been charged, held or released."
)


def require_marketplace_payments_enabled() -> None:
    """FastAPI dependency: refuse money movement unless explicitly enabled.

    Enforced at the API boundary, not just hidden in the UI, so a direct API
    call cannot create a hold or report a release while the payout side of
    the lifecycle does not exist.
    """
    if not settings.MARKETPLACE_PAYMENTS_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=PAYMENTS_DISABLED_DETAIL
        )
