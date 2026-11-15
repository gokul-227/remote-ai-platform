"""Company board rows for ATS sources and the staff-run validation tool.

- ``sync_board_rows`` loads the bundled lists (``aggregators/boards/*.txt`` +
  settings) into ``job_source_boards``; existing rows keep their state.
- ``active_boards`` is what an import fetches: enabled rows not known to be
  gone (``not_found``) or blocked by robots.txt.
- ``validate_boards`` checks unchecked/oldest boards one at a time, pausing
  60 / job_sources.rate_limit_per_minute seconds between boards. It runs only
  when staff start it (console button -> ``jobs.validate_boards`` task, or
  ``python -m app.domains.jobs.board_validation SOURCE [LIMIT]``), never as part
  of an import.
"""

from __future__ import annotations

import asyncio
import sys
from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.jobs.aggregators import robots
from app.domains.jobs.aggregators.base import SourceDisabledError, SourceFetchError
from app.domains.jobs.aggregators.board_lists import BOARD_SOURCES, configured_boards
from app.domains.tasks.models import JobSource, JobSourceBoard

EXCLUDED = ("not_found", "robots_blocked")
MAX_VALIDATE = 500


async def sync_board_rows(db: AsyncSession, source: str | None = None) -> int:
    """Insert bundled/configured boards that have no row yet. Returns rows added."""
    added = 0
    for name in [source] if source else list(BOARD_SOURCES):
        if name not in BOARD_SOURCES:
            continue
        existing = {
            t.lower()
            for t in (
                await db.execute(select(JobSourceBoard.token).where(JobSourceBoard.source == name))
            ).scalars()
        }
        for token in configured_boards(name):
            if token.lower() not in existing and len(token) <= 200:
                db.add(JobSourceBoard(source=name, token=token))
                existing.add(token.lower())
                added += 1
    if added:
        await db.commit()
    return added


async def active_boards(db: AsyncSession, source: str) -> list[str] | None:
    """Boards to import for `source`, or None when the table has no rows for it."""
    total = await db.scalar(
        select(func.count()).select_from(JobSourceBoard).where(JobSourceBoard.source == source)
    )
    if not total:
        return None
    rows = await db.execute(
        select(JobSourceBoard.token).where(
            JobSourceBoard.source == source,
            JobSourceBoard.enabled.is_(True),
            JobSourceBoard.status.not_in(EXCLUDED),
        )
    )
    return list(rows.scalars())


async def board_summary(db: AsyncSession) -> dict[str, dict[str, int]]:
    rows = await db.execute(
        select(JobSourceBoard.source, JobSourceBoard.status, func.count()).group_by(
            JobSourceBoard.source, JobSourceBoard.status
        )
    )
    out: dict[str, dict[str, int]] = {}
    for source, status, n in rows.all():
        out.setdefault(source, {})[status] = int(n)
    return out


def _aggregator(source: str) -> Any:
    from app.domains.jobs.service import AGGREGATORS

    for cls in AGGREGATORS:
        if cls.source_name == source:
            return cls()
    raise KeyError(source)


async def _classify(agg: Any, token: str) -> tuple[str, int | None]:
    agg.boards = [token]
    agg.cursor = {}
    try:
        jobs = await agg.fetch_jobs(limit=100000)
    except SourceDisabledError:
        return "robots_blocked", None
    except SourceFetchError:
        url = agg.board_url.format(board=token) if agg.board_url else None
        if url:
            try:
                async with httpx.AsyncClient(
                    timeout=httpx.Timeout(20.0), headers={"User-Agent": robots.user_agent()}
                ) as c:
                    r = await c.get(url)
                if r.status_code in (404, 410) or 300 <= r.status_code < 400:
                    return "not_found", None
            except Exception:
                pass
        return "error", None
    return ("ok" if jobs else "empty"), len(jobs)


async def validate_boards(
    db: AsyncSession, source: str, limit: int = 100, *, sleep: Any = asyncio.sleep
) -> dict[str, int]:
    """Check up to `limit` boards (unchecked first, then the longest unchecked)."""
    source = source.upper()
    if source not in BOARD_SOURCES:
        raise KeyError(source)
    await sync_board_rows(db, source)
    row = await db.get(JobSource, source)
    rate = max(1, row.rate_limit_per_minute if row else 60)
    pause = 60.0 / rate
    boards = (
        (
            await db.execute(
                select(JobSourceBoard)
                .where(JobSourceBoard.source == source)
                .order_by(
                    (JobSourceBoard.status != "unchecked"),
                    JobSourceBoard.checked_at.asc().nulls_first(),
                    JobSourceBoard.token,
                )
                .limit(max(1, min(limit, MAX_VALIDATE)))
            )
        )
        .scalars()
        .all()
    )
    agg = _aggregator(source)
    counts: dict[str, int] = {}
    for i, board in enumerate(boards):
        if i:
            await sleep(pause)
        status, n = await _classify(agg, board.token)
        board.status = status
        board.job_count = n
        board.checked_at = datetime.now(UTC)
        counts[status] = counts.get(status, 0) + 1
        await db.commit()
    return counts


async def _main(source: str, limit: int) -> None:  # pragma: no cover - operator CLI
    from app.core.database import AsyncSessionFactory

    async with AsyncSessionFactory() as db:
        print(await validate_boards(db, source, limit))


if __name__ == "__main__":  # pragma: no cover
    asyncio.run(_main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 100))
