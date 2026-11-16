"""Saved job searches and their alerts.

"Save this search" stores the search's filters; `send_job_alerts` (Celery Beat,
hourly) tells each member with alerts on how many new jobs match since the last
alert, through `notify_user` with kind "job_alert" — so the member's
notification preferences for the "job" category decide in-app, email
(immediate/digest/off) and push. Mounted before the jobs router so
`/jobs/saved-searches` is never shadowed by `/jobs/{job_id}`.
"""

import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User
from app.domains.jobs.models import SavedJobSearch
from app.domains.jobs.repository import JobRepository
from app.domains.jobs.schemas import PAGING, JobSearchQuery

router = APIRouter(prefix="/jobs/saved-searches", tags=["Saved Job Searches"])

MAX_SAVED_SEARCHES = 25
FREQUENCIES = {"daily": timedelta(days=1), "weekly": timedelta(days=7)}


def clean_params(params: dict[str, Any]) -> dict[str, Any]:
    """Validated filters only (unknown keys, paging and defaults dropped)."""
    try:
        q = JobSearchQuery.model_validate(params)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="Invalid search filters") from exc
    return q.model_dump(mode="json", exclude_none=True, exclude=PAGING)


class SavedSearchIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    params: dict[str, Any] = Field(default_factory=dict)
    alerts: bool = True
    frequency: str = Field(default="daily", pattern="^(daily|weekly)$")


class SavedSearchPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    alerts: bool | None = None
    frequency: str | None = Field(default=None, pattern="^(daily|weekly)$")


class SavedSearchOut(SavedSearchIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    last_notified_at: datetime | None = None
    created_at: datetime


@router.get("", response_model=list[SavedSearchOut])
async def list_saved_searches(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[SavedJobSearch]:
    rows = await db.scalars(
        select(SavedJobSearch)
        .where(SavedJobSearch.user_id == user.id)
        .order_by(SavedJobSearch.created_at.desc())
    )
    return list(rows.all())


@router.post("", response_model=SavedSearchOut, status_code=status.HTTP_201_CREATED)
async def create_saved_search(
    body: SavedSearchIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SavedJobSearch:
    existing = (
        await db.scalars(select(SavedJobSearch.id).where(SavedJobSearch.user_id == user.id))
    ).all()
    if len(existing) >= MAX_SAVED_SEARCHES:
        raise HTTPException(status_code=409, detail=f"Up to {MAX_SAVED_SEARCHES} saved searches")
    row = SavedJobSearch(
        user_id=user.id,
        name=body.name.strip(),
        params=clean_params(body.params),
        alerts=body.alerts,
        frequency=body.frequency,
        # Alerts cover jobs posted after saving.
        last_notified_at=datetime.now(UTC),
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def _own(db: AsyncSession, user: User, search_id: uuid.UUID) -> SavedJobSearch:
    row = await db.get(SavedJobSearch, search_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Saved search not found")
    return row


@router.patch("/{search_id}", response_model=SavedSearchOut)
async def update_saved_search(
    search_id: uuid.UUID,
    body: SavedSearchPatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SavedJobSearch:
    row = await _own(db, user, search_id)
    for key, value in body.model_dump(exclude_none=True).items():
        setattr(row, key, value.strip() if isinstance(value, str) and key == "name" else value)
    await db.flush()
    await db.refresh(row)
    return row


@router.delete("/{search_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_search(
    search_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await db.delete(await _own(db, user, search_id))
    await db.flush()


def search_link(params: dict[str, Any]) -> str:
    """The in-app #jobs URL for these filters (same names the screen uses)."""
    pairs: list[tuple[str, str]] = []
    for key, value in params.items():
        if key == "is_remote":
            continue
        for v in value if isinstance(value, list) else [value]:
            pairs.append((key, str(v).lower() if isinstance(v, bool) else str(v)))
    return "#jobs" + (f"?{urlencode(pairs)}" if pairs else "")


ALERT_BATCH = 500
ALERT_MAX_PER_RUN = 20000


async def send_job_alerts(db: AsyncSession, now: datetime | None = None) -> dict[str, int]:
    """One alert per due saved search with new matches since the last alert.

    Scales with the number of *due* searches, not all of them: due rows are
    picked in SQL (oldest first, ALERT_BATCH at a time, at most ALERT_MAX_PER_RUN
    per hourly run; the rest wait an hour), and searches with identical filters
    and the same starting point share one count query."""
    from sqlalchemy import func, or_

    from app.services.notifications.service import notify_user

    now = now or datetime.now(UTC)
    repo = JobRepository(db)
    sent = checked = 0
    counts: dict[tuple[str, str], int] = {}
    last_ts = func.coalesce(SavedJobSearch.last_notified_at, SavedJobSearch.created_at)
    due = or_(
        *[
            (SavedJobSearch.frequency == name) & (last_ts <= now - every)
            for name, every in FREQUENCIES.items()
        ],
        SavedJobSearch.frequency.not_in(list(FREQUENCIES)) & (last_ts <= now - FREQUENCIES["daily"]),
    )
    while checked < ALERT_MAX_PER_RUN:
        rows = (
            await db.scalars(
                select(SavedJobSearch)
                .where(SavedJobSearch.alerts.is_(True), due)
                .order_by(last_ts, SavedJobSearch.id)
                .limit(ALERT_BATCH)
            )
        ).all()
        if not rows:
            break
        for row in rows:
            since = row.last_notified_at or row.created_at
            if since.tzinfo is None:
                since = since.replace(tzinfo=UTC)
            checked += 1
            row.last_notified_at = now  # also for rows with stale filters: never re-picked hourly
            try:
                filters = JobSearchQuery.model_validate(row.params).filters()
            except ValidationError:
                continue
            memo = (json.dumps(filters, sort_keys=True, default=str), since.isoformat())
            if memo not in counts:
                counts[memo] = await repo.count(**filters, posted_since=since)
            n = counts[memo]
            if n:
                await notify_user(
                    db,
                    row.user_id,
                    f"{n} new job{'s' if n != 1 else ''} for “{row.name}”",
                    "New jobs match your saved search.",
                    kind="job_alert",
                    email_event_key=f"job_alert:{row.id}:{now:%Y%m%d%H}",
                    email_link=search_link(row.params),
                )
                sent += 1
        await db.commit()
        if len(rows) < ALERT_BATCH:
            break
    return {"checked": checked, "sent": sent}
