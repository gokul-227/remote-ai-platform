"""Retired server-side page proxy.

Project websites are opened directly by the browser, so their framing policies
and security headers remain authoritative. The historical endpoints return a
clear failure for older clients instead of fetching arbitrary third-party pages,
stripping frame restrictions or creating an SSRF surface on the API server.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User

router = APIRouter(prefix="/browser", tags=["Browser"])

_RETIRED = "Website proxying is no longer supported. Open the website directly or in a new tab."


@router.post("/views", deprecated=True)
async def create_view(_: User = Depends(get_current_user)) -> None:
    raise HTTPException(status.HTTP_410_GONE, _RETIRED)


@router.get("/view", include_in_schema=False)
async def view() -> None:
    # Old links and signed tokens must not trigger any upstream network request.
    raise HTTPException(status.HTTP_410_GONE, _RETIRED)
