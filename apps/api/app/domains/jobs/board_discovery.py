"""ATS company-board discovery (Celery task ``jobs.discover_boards``, every 6 h).

Where boards come from, all public and lawful:
- outbound apply links and links in descriptions of postings we already import
  (Himalayas, Arbeitnow, Jobicy, RemoteOK, We Work Remotely, HN "Who is hiring",
  JobTech, ...): each import records them as it parses (``_Board._job``), and
  this task also scans stored jobs, resuming from a checkpoint;
- the bundled seed lists (``aggregators/boards/*.txt``), loaded as before;
- optional public lists of career-site URLs (``JOB_BOARD_SEED_URLS``).
None of the ten ATSes publishes a sitemap or directory of company boards
(checked Nov 2026), and the Common Crawl index disallows crawlers in its
robots.txt, so neither is used.

New tokens land in ``job_board_candidates``. Validation makes one request per
candidate to the board's public feed URL (the importer's ``board_url``), after
the robots.txt check, with at most one request per ATS per
JOB_BOARD_HOST_INTERVAL_SECONDS (robots.txt Crawl-delay wins if larger). A live
board (jobs or an empty but valid feed) is copied to ``job_source_boards``,
where the rotating imports pick it up; 404/410 (or a redirect away from the
board) JOB_BOARD_DEAD_AFTER_404S times marks it not_found.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.domains.jobs.aggregators import robots
from app.domains.jobs.aggregators.ats_links import CASE_SENSITIVE, extract_boards
from app.domains.jobs.aggregators.board_lists import BOARD_SOURCES
from app.domains.jobs.models import JobPost
from app.domains.tasks.models import JobBoardCandidate, JobImportCheckpoint, JobSourceBoard

logger = get_logger("jobs.board_discovery")

CHECKPOINT = "BOARD_DISCOVERY"
SCAN_BATCH = 2000
RECHECK_AFTER = timedelta(days=1)
# Discoverable sources (Rippling/Workday boards are not recognisable from links).
DISCOVERABLE = tuple(
    s
    for s in (
        "GREENHOUSE",
        "LEVER",
        "ASHBY",
        "SMARTRECRUITERS",
        "WORKABLE",
        "RECRUITEE",
        "PERSONIO",
        "TEAMTAILOR",
        "BAMBOOHR",
        "BREEZY",
    )
    if s in BOARD_SOURCES
)


def _key(source: str, token: str) -> str:
    return token if source in CASE_SENSITIVE else token.lower()


async def _known(db: AsyncSession, source: str) -> set[str]:
    rows = await db.execute(select(JobSourceBoard.token).where(JobSourceBoard.source == source))
    cand = await db.execute(
        select(JobBoardCandidate.token).where(JobBoardCandidate.source == source)
    )
    return {_key(source, t) for t in (*rows.scalars(), *cand.scalars())}


async def record_candidates(
    db: AsyncSession, found: set[tuple[str, str]], origin: str
) -> int:
    """Store boards not seen before as pending candidates. Returns how many."""
    added = 0
    by_source: dict[str, set[str]] = {}
    for source, token in found:
        if source in DISCOVERABLE and 0 < len(token) <= 200:
            by_source.setdefault(source, set()).add(token)
    for source, tokens in by_source.items():
        known = await _known(db, source)
        for token in sorted(tokens):
            if _key(source, token) in known:
                continue
            known.add(_key(source, token))
            db.add(JobBoardCandidate(source=source, token=token, origin=origin[:40]))
            added += 1
    if added:
        await db.commit()
    return added


async def scan_stored_jobs(db: AsyncSession, cursor: dict[str, Any], max_rows: int) -> tuple[set[tuple[str, str]], dict[str, Any], int]:
    """Links to ATS boards in stored jobs created after the checkpoint (keyset
    on created_at, id). Returns (boards, new cursor, rows scanned)."""
    found: set[tuple[str, str]] = set()
    after_raw = cursor.get("scan_after")
    after = datetime.fromisoformat(after_raw) if after_raw else None
    after_id = cursor.get("scan_after_id") or ""
    scanned = 0
    while scanned < max_rows:
        stmt = select(JobPost.created_at, JobPost.id, JobPost.external_url, JobPost.description)
        if after is not None:
            last = uuid.UUID(after_id) if after_id else uuid.UUID(int=0)
            stmt = stmt.where(
                (JobPost.created_at > after) | ((JobPost.created_at == after) & (JobPost.id > last))
            )
        rows = (
            await db.execute(
                stmt.order_by(JobPost.created_at, JobPost.id).limit(min(SCAN_BATCH, max_rows - scanned))
            )
        ).all()
        if not rows:
            break
        for _created, _id, url, description in rows:
            found |= extract_boards(url, description)
        scanned += len(rows)
        after, after_id = rows[-1][0], str(rows[-1][1])
        if len(rows) < SCAN_BATCH:
            break
    new_cursor = {
        "scan_after": after.isoformat() if after else None,
        "scan_after_id": after_id,
    }
    return found, new_cursor, scanned


async def fetch_seed_lists(client: httpx.AsyncClient) -> set[tuple[str, str]]:
    found: set[tuple[str, str]] = set()
    for url in [u.strip() for u in settings.JOB_BOARD_SEED_URLS.split(",") if u.strip()]:
        if not url.startswith(("http://", "https://")):
            continue
        try:
            if not await robots.allowed(client, url):
                continue
            r = await client.get(url)
            r.raise_for_status()
            found |= extract_boards(r.text)
        except Exception as exc:
            logger.warning("Seed list unreadable", url=url, error=type(exc).__name__)
    return found


def _count_jobs(response: httpx.Response) -> int | None:
    """Jobs in a board feed answer, or None when it is not a feed (an HTML page)."""
    ctype = response.headers.get("content-type", "")
    body = response.text
    if "json" in ctype or body[:1] in "[{":
        try:
            data = json.loads(body)
        except ValueError:
            return None
        if isinstance(data, list):
            return len(data)
        if isinstance(data, dict):
            for key in ("jobs", "content", "offers", "result", "positions", "postings"):
                if isinstance(data.get(key), list):
                    return len(data[key])
            if isinstance(data.get("totalFound"), int):
                return int(data["totalFound"])
        return None
    if "xml" in ctype or "rss" in ctype or body.lstrip()[:5] == "<?xml":
        return body.count("<item") + body.count("<position>")
    return None


def _probe_url(source: str, token: str) -> str | None:
    from app.domains.jobs.service import AGGREGATORS

    for cls in AGGREGATORS:
        if cls.source_name == source:
            board_url = getattr(cls, "board_url", "")
            return board_url.format(board=token) if board_url else None
    return None


async def probe(client: httpx.AsyncClient, source: str, token: str) -> tuple[str, int | None]:
    """One request: ok | empty | not_found | robots_blocked | error."""
    url = _probe_url(source, token)
    if not url:
        return "error", None
    try:
        if not await robots.allowed(client, url):
            return "robots_blocked", None
        r = await client.get(url)
    except Exception:
        return "error", None
    if r.status_code in (404, 410) or 300 <= r.status_code < 400:
        return "not_found", None
    if r.status_code != 200:
        return "error", None
    n = _count_jobs(r)
    if n is None:
        return "not_found", None  # an HTML page (e.g. the ATS's marketing site)
    return ("ok" if n else "empty"), n


async def validate_candidates(
    db: AsyncSession,
    limit: int,
    deadline: float,
    *,
    limiter: robots.HostLimiter | None = None,
) -> dict[str, int]:
    """Validate pending candidates, one ATS at a time per rate key, several ATSes
    in parallel. Live boards are promoted to job_source_boards."""
    now = datetime.now(UTC)
    rows = (
        (
            await db.execute(
                select(JobBoardCandidate)
                .where(
                    JobBoardCandidate.status == "pending",
                    (JobBoardCandidate.checked_at.is_(None))
                    | (JobBoardCandidate.checked_at < now - RECHECK_AFTER),
                )
                .order_by(
                    JobBoardCandidate.checked_at.asc().nulls_first(),
                    JobBoardCandidate.discovered_at,
                )
                .limit(max(0, limit))
            )
        )
        .scalars()
        .all()
    )
    limiter = limiter or robots.HostLimiter(settings.JOB_BOARD_HOST_INTERVAL_SECONDS)
    groups: dict[str, list[JobBoardCandidate]] = {}
    for row in rows:
        groups.setdefault(row.source, []).append(row)
    results: list[tuple[JobBoardCandidate, str, int | None]] = []

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(20.0),
        follow_redirects=False,
        headers={"User-Agent": robots.user_agent()},
    ) as client:

        async def walk(items: list[JobBoardCandidate]) -> None:
            for cand in items:
                if time.monotonic() >= deadline:
                    return
                url = _probe_url(cand.source, cand.token)
                if url:
                    await limiter.wait(url)
                status, n = await probe(client, cand.source, cand.token)
                results.append((cand, status, n))

        await asyncio.gather(*(walk(items) for items in groups.values()))

    counts: dict[str, int] = {}
    stamp = datetime.now(UTC)
    for cand, status, n in results:
        cand.checked_at = stamp
        if status in ("ok", "empty"):
            cand.status, cand.job_count, cand.fail_count = status, n, 0
            if await db.get(JobSourceBoard, (cand.source, cand.token)) is None:
                db.add(
                    JobSourceBoard(
                        source=cand.source,
                        token=cand.token,
                        status=status,
                        job_count=n,
                        checked_at=stamp,
                        origin=cand.origin[:40],
                    )
                )
            counts["promoted"] = counts.get("promoted", 0) + 1
            counts["promoted_jobs"] = counts.get("promoted_jobs", 0) + (n or 0)
        elif status == "not_found":
            cand.fail_count += 1
            if cand.fail_count >= settings.JOB_BOARD_DEAD_AFTER_404S:
                cand.status = "not_found"
                counts["dead"] = counts.get("dead", 0) + 1
        elif status == "robots_blocked":
            cand.status = status
        counts[status] = counts.get(status, 0) + 1
    await db.commit()
    counts["checked"] = len(results)
    return counts


async def record_import_outcomes(db: AsyncSession, source: str, outcomes: dict[str, int]) -> int:
    """After an import: reset fail counts of boards that answered, count 404/410s,
    and retire boards that 404 JOB_BOARD_DEAD_AFTER_404S runs in a row. Returns
    boards retired."""
    if not outcomes:
        return 0
    retired = 0
    tokens = list(outcomes)
    for start in range(0, len(tokens), 1000):
        chunk = tokens[start : start + 1000]
        rows = (
            await db.execute(
                select(JobSourceBoard).where(
                    JobSourceBoard.source == source, JobSourceBoard.token.in_(chunk)
                )
            )
        ).scalars()
        for row in rows:
            code = outcomes.get(row.token)
            if code == 200:
                row.fail_count = 0
            elif code in (404, 410):
                row.fail_count = (row.fail_count or 0) + 1
                if row.fail_count >= settings.JOB_BOARD_DEAD_AFTER_404S and row.status != "not_found":
                    row.status = "not_found"
                    row.checked_at = datetime.now(UTC)
                    retired += 1
    await db.commit()
    return retired


async def board_counts(db: AsyncSession) -> dict[str, int]:
    live = await db.scalar(
        select(func.count())
        .select_from(JobSourceBoard)
        .where(JobSourceBoard.enabled.is_(True), JobSourceBoard.status.not_in(("not_found", "robots_blocked")))
    )
    pending = await db.scalar(
        select(func.count()).select_from(JobBoardCandidate).where(JobBoardCandidate.status == "pending")
    )
    return {"boards_live": int(live or 0), "candidates_pending": int(pending or 0)}


async def run_discovery(db: AsyncSession) -> dict[str, Any]:
    """One discovery run: load seeds, harvest links, validate candidates."""
    from app.domains.jobs.board_validation import sync_board_rows

    started = time.monotonic()
    deadline = started + settings.JOB_BOARD_DISCOVERY_BUDGET_SECONDS
    seeded = await sync_board_rows(db)
    cp = await db.get(JobImportCheckpoint, CHECKPOINT)
    cursor = dict((cp.cursor or {}) if cp else {})
    found, scan_cursor, scanned = await scan_stored_jobs(
        db, cursor, settings.JOB_BOARD_SCAN_ROWS_PER_RUN
    )
    new = await record_candidates(db, found, "scan:jobs")
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(30.0),
        follow_redirects=True,
        headers={"User-Agent": robots.user_agent()},
    ) as client:
        seeds = await fetch_seed_lists(client)
    new_from_lists = await record_candidates(db, seeds, "seed_list")
    validated = await validate_candidates(db, settings.JOB_BOARD_VALIDATE_PER_RUN, deadline)
    if cp is None:
        cp = JobImportCheckpoint(source=CHECKPOINT, cursor={}, consecutive_failures=0)
        db.add(cp)
    cp.cursor = {**cursor, **scan_cursor}
    cp.last_success_at = datetime.now(UTC)
    cp.last_error = None
    cp.consecutive_failures = 0
    await db.commit()
    return {
        "seeded_from_lists": seeded,
        "jobs_scanned": scanned,
        "boards_found": len(found) + len(seeds),
        "new_candidates": new + new_from_lists,
        **{f"validated_{k}": v for k, v in validated.items()},
        **await board_counts(db),
        "seconds": round(time.monotonic() - started, 1),
    }
