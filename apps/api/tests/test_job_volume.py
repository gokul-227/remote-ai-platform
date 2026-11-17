"""Job volume: ATS board discovery, catalogue sweeps of the public employment
services, time-budgeted board rotation, dead-board retirement and the discovery
task. No network: every request goes to an httpx.MockTransport."""

import time
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select

from app.core.config import settings
from app.domains.jobs import board_discovery as bd
from app.domains.jobs.aggregators import robots
from app.domains.jobs.aggregators.ats_links import board_from_url, extract_boards
from app.domains.jobs.aggregators.government import (
    BundesagenturAggregator,
    JobTechAggregator,
    NAVAggregator,
)
from app.domains.jobs.aggregators.public_boards import GreenhouseAggregator
from app.domains.jobs.models import JobPost
from app.domains.jobs.repository import JobRepository
from app.domains.jobs.schemas import JobPostCreate
from app.domains.jobs.service import JobService
from app.domains.tasks.models import JobBoardCandidate, JobImportCheckpoint, JobSourceBoard


@pytest.fixture
def mock_http(monkeypatch):
    """Install a handler(request) -> Response for every httpx.AsyncClient."""
    state: dict = {"handler": lambda r: httpx.Response(404), "seen": []}

    def handler(request: httpx.Request) -> httpx.Response:
        state["seen"].append(request)
        if request.url.path == "/robots.txt" and "robots" not in state:
            return httpx.Response(404)
        return state["handler"](request)

    real = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw)
    )
    monkeypatch.setattr(settings, "JOB_SOURCE_REQUEST_DELAY_SECONDS", 0)
    monkeypatch.setattr(settings, "ATS_BOARD_SHARDS", 1)
    robots.clear_cache()
    yield state
    robots.clear_cache()


# ── link recognition ─────────────────────────────────────────────────────────


def test_extract_boards_from_links_and_html():
    text = """
    Apply: https://boards.greenhouse.io/Acme/jobs/123 or <a href="https://jobs.lever.co/beta-co/abc">x</a>
    https://jobs.ashbyhq.com/CaseCo/uuid https://apply.workable.com/delta/j/ABC/
    https://gamma.recruitee.com/o/dev https://eps.jobs.personio.de/job/1
    https://zeta.teamtailor.com/jobs/1-dev https://eta.bamboohr.com/careers/9
    https://theta.breezy.hr/p/1 https://jobs.smartrecruiters.com/Iota/7432
    https://boards.greenhouse.io/embed/job_app?token=1&amp;for=kappa
    https://www.teamtailor.com/en https://app.recruitee.com/ https://example.com/jobs
    """
    found = extract_boards(text, None, "")
    assert found == {
        ("GREENHOUSE", "acme"),
        ("GREENHOUSE", "kappa"),
        ("LEVER", "beta-co"),
        ("ASHBY", "CaseCo"),  # Ashby tokens keep their case
        ("WORKABLE", "delta"),
        ("RECRUITEE", "gamma"),
        ("PERSONIO", "eps"),
        ("TEAMTAILOR", "zeta"),
        ("BAMBOOHR", "eta"),
        ("BREEZY", "theta"),
        ("SMARTRECRUITERS", "Iota"),
    }
    assert extract_boards("no links here") == set()
    assert board_from_url("https://boards-api.greenhouse.io/v1/boards/omega/jobs") == (
        "GREENHOUSE",
        "omega",
    )
    assert board_from_url("https://jobs.lever.co/") is None


# ── per-host pacing ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_host_limiter_paces_per_ats_and_honours_crawl_delay():
    now = [100.0]
    slept: list[float] = []

    async def sleep(s: float) -> None:
        slept.append(s)
        now[0] += s

    limiter = robots.HostLimiter(1.0, sleep=sleep, clock=lambda: now[0])
    await limiter.wait("https://a.teamtailor.com/jobs.rss")
    await limiter.wait("https://b.teamtailor.com/jobs.rss")  # same ATS: waits
    await limiter.wait("https://api.lever.co/v0/postings/x")  # other ATS: no wait
    assert slept == [1.0]
    assert robots.rate_key("https://x.jobs.personio.de/xml") == "personio.de"

    # robots.txt Crawl-delay is used once the host's rules are cached.
    robots.clear_cache()
    parser = robots.RobotFileParser()
    parser.parse(["User-agent: *", "Crawl-delay: 5"])
    robots._cache["https://api.lever.co"] = (time.monotonic(), parser, True)
    assert robots.crawl_delay("https://api.lever.co/v0/postings/x") == 5.0
    assert robots.crawl_delay("https://unknown.example/") is None
    slept.clear()
    await limiter.wait("https://api.lever.co/v0/postings/y")
    await limiter.wait("https://api.lever.co/v0/postings/z")
    assert slept
    assert slept[-1] == 5.0
    robots.clear_cache()


# ── Bundesagentur partitions ─────────────────────────────────────────────────


def _ba_item(ref: str) -> dict:
    return {
        "refnr": ref,
        "titel": f"Job {ref}",
        "arbeitgeber": "Firma",
        "arbeitsort": {"ort": "Berlin"},
        "aktuelleVeroeffentlichungsdatum": datetime.now(UTC).date().isoformat(),
    }


@pytest.mark.asyncio
async def test_bundesagentur_splits_partitions_over_the_cap_and_resumes(mock_http, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        p = request.url.params
        field = p.get("berufsfeld")
        if field is None:  # the whole catalogue: over the 10,000 cap
            return httpx.Response(
                200,
                json={
                    "maxErgebnisse": 25000,
                    "ergebnisliste": [_ba_item(f"root{i}") for i in range(100)],
                    "facetten": {"berufsfeld": {"counts": {"Bau": 150, "IT": 30, "Leer": 0}}},
                },
            )
        page = int(p["page"])
        total = 150 if field == "Bau" else 30
        start = (page - 1) * 100
        items = [_ba_item(f"{field}{i}") for i in range(start, min(total, start + 100))]
        return httpx.Response(200, json={"maxErgebnisse": total, "ergebnisliste": items})

    mock_http["handler"] = handler
    monkeypatch.setattr(settings, "BUNDESAGENTUR_MAX_PAGES", 2)
    agg = BundesagenturAggregator()
    await agg.fetch_jobs(limit=10000)
    # Run 1: root (split into Bau, IT) + Bau page 1, then the page budget is spent.
    assert agg.next_cursor["queue"] == [{"berufsfeld": "Bau"}, {"berufsfeld": "IT"}]
    assert agg.next_cursor["page"] == 2
    assert agg.sweep_started is None

    monkeypatch.setattr(settings, "BUNDESAGENTUR_MAX_PAGES", 100)
    agg2 = BundesagenturAggregator()
    agg2.cursor = agg.next_cursor
    jobs = await agg2.fetch_jobs(limit=10000)
    assert len(jobs) == 50 + 30  # Bau page 2 and IT
    assert agg2.next_cursor == {}
    assert agg2.sweep_started == datetime.fromisoformat(agg.next_cursor["sweep_started"])


@pytest.mark.asyncio
async def test_bundesagentur_stops_when_out_of_time(mock_http):
    mock_http["handler"] = lambda r: httpx.Response(200, json={"maxErgebnisse": 0})
    agg = BundesagenturAggregator()
    agg.reset_run(deadline=time.monotonic() - 1)
    assert await agg.fetch_jobs() == []
    assert agg.next_cursor["queue"] == [{}]


# ── JobTech windows ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_jobtech_halves_busy_windows(mock_http, monkeypatch):
    monkeypatch.setattr(settings, "JOB_RETENTION_DAYS", 1)
    calls: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        p = request.url.params
        calls.append((p["published-after"], p["published-before"]))
        a = datetime.fromisoformat(p["published-after"])
        b = datetime.fromisoformat(p["published-before"])
        busy = b - a > timedelta(hours=12)
        hit = {
            "id": f"{p['published-after']}",
            "headline": "Utvecklare",
            "employer": {"name": "AB"},
            "webpage_url": "https://arbetsformedlingen.se/platsbanken/annonser/1",
            "publication_date": datetime.now(UTC).isoformat(),
        }
        return httpx.Response(
            200, json={"total": {"value": 5000 if busy else 1}, "hits": [] if busy else [hit]}
        )

    mock_http["handler"] = handler
    agg = JobTechAggregator()
    jobs = await agg.fetch_jobs(limit=100)
    assert len(calls) == 3  # one day, then its two halves
    assert len(jobs) == 2
    assert agg.next_cursor == {}


# ── NAV removals ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_nav_inactive_entries_close_ads_and_walk_restarts(mock_http, monkeypatch):
    def entry(uid: str, status: str) -> dict:
        return {
            "id": uid,
            "_feed_entry": {
                "uuid": uid,
                "status": status,
                "title": "Snekker",
                "businessName": "AS",
                "municipal": "OSLO",
                "sistEndret": datetime.now(UTC).isoformat(),
            },
        }

    pages = {
        "/api/v1/feed": {"id": "p1", "next_id": "p2", "items": [entry("a", "ACTIVE"), entry("b", "ACTIVE")]},
        "/api/v1/feed/p2": {"id": "p2", "next_id": None, "items": [entry("b", "INACTIVE")]},
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/publicToken":
            return httpx.Response(200, text="token:\naaa.bbb.ccc\n")
        return httpx.Response(200, json=pages[request.url.path])

    mock_http["handler"] = handler
    agg = NAVAggregator()
    jobs = await agg.fetch_jobs(limit=100)
    assert [j.external_id for j in jobs] == ["nav_a"]
    assert agg.removed_ids == ["nav_b"]
    assert agg.next_cursor["page"] == "p2"
    # A week later the walk starts over from the first page.
    old = dict(agg.next_cursor, walk_done_at=(datetime.now(UTC) - timedelta(days=8)).isoformat())
    agg2 = NAVAggregator()
    agg2.cursor = old
    await agg2.fetch_jobs(limit=100)
    assert [r.url.path for r in mock_http["seen"] if "feed" in r.url.path][-2:] == [
        "/api/v1/feed",
        "/api/v1/feed/p2",
    ]
    assert agg2.sweep_started is not None


# ── board rotation within the time budget, 404 bookkeeping, discovery ───────


@pytest.mark.asyncio
async def test_board_rotation_checkpoints_only_boards_reached(mock_http, monkeypatch):
    monkeypatch.setattr(settings, "ATS_BOARDS_PER_RUN", 3)
    monkeypatch.setattr(settings, "ATS_BOARD_CONCURRENCY", 1)

    def handler(request: httpx.Request) -> httpx.Response:
        board = request.url.path.split("/")[3]
        if board == "b1":
            return httpx.Response(404)
        return httpx.Response(
            200,
            json={
                "jobs": [
                    {
                        "id": 1,
                        "title": "Engineer",
                        "absolute_url": f"https://boards.greenhouse.io/{board}/jobs/1",
                        "content": "Also see https://jobs.lever.co/sisterco/1",
                    }
                ]
            },
        )

    mock_http["handler"] = handler
    agg = GreenhouseAggregator()
    agg.boards = [f"b{i}" for i in range(7)]
    jobs = await agg.fetch_jobs(limit=100)
    assert len(jobs) == 2
    assert agg.board_outcomes == {"b0": 200, "b1": 404, "b2": 200}
    assert ("LEVER", "sisterco") in agg.discovered
    assert agg.next_cursor == {"offset": 3, "boards": 7}

    # Out of time after the first board: the checkpoint stays at the next board.
    agg2 = GreenhouseAggregator()
    agg2.boards = [f"b{i}" for i in range(7)]
    agg2.cursor = {"offset": 3}
    real = agg2.out_of_time
    calls = {"n": 0}

    def out_of_time() -> bool:
        calls["n"] += 1
        return calls["n"] > 1 or real()

    agg2.out_of_time = out_of_time  # type: ignore[method-assign]
    await agg2.fetch_jobs(limit=100)
    assert agg2.next_cursor == {"offset": 4, "boards": 7}


@pytest.mark.asyncio
async def test_candidates_validate_promote_and_die(db, mock_http, monkeypatch):
    monkeypatch.setattr(settings, "JOB_BOARD_DEAD_AFTER_404S", 2)
    db.add(JobSourceBoard(source="GREENHOUSE", token="known"))
    await db.commit()
    added = await bd.record_candidates(
        db,
        {
            ("GREENHOUSE", "known"),
            ("GREENHOUSE", "live"),
            ("GREENHOUSE", "empty"),
            ("LEVER", "gone"),
            ("TEAMTAILOR", "html"),
            ("TEAMTAILOR", "private"),
            ("RIPPLING", "ignored"),
        },
        "link:HIMALAYAS",
    )
    assert added == 5
    assert await bd.record_candidates(db, {("GREENHOUSE", "LIVE")}, "x") == 0

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if request.url.host == "private.teamtailor.com" and request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /")
        if "/live/" in url:
            return httpx.Response(200, json={"jobs": [{"id": 1}, {"id": 2}]})
        if "/empty/" in url:
            return httpx.Response(200, json={"jobs": []})
        if request.url.host == "html.teamtailor.com":
            return httpx.Response(200, text="<html>marketing</html>", headers={"content-type": "text/html"})
        return httpx.Response(404)

    mock_http["handler"] = handler
    mock_http["robots"] = True  # robots.txt requests reach the handler too
    monkeypatch.setattr(settings, "JOB_SOURCE_RESPECT_ROBOTS", True)
    no_wait = robots.HostLimiter(0)
    counts = await bd.validate_candidates(db, 100, time.monotonic() + 60, limiter=no_wait)
    assert counts["checked"] == 5
    assert counts["promoted"] == 2
    assert counts["promoted_jobs"] == 2
    live = await db.get(JobSourceBoard, ("GREENHOUSE", "live"))
    assert live.status == "ok"
    assert live.job_count == 2
    assert live.origin == "link:HIMALAYAS"
    assert (await db.get(JobBoardCandidate, ("TEAMTAILOR", "private"))).status == "robots_blocked"
    gone = await db.get(JobBoardCandidate, ("LEVER", "gone"))
    assert gone.status == "pending"
    assert gone.fail_count == 1
    # Re-checked only after a day; the second 404 retires it.
    gone.checked_at = datetime.now(UTC) - timedelta(days=2)
    html = await db.get(JobBoardCandidate, ("TEAMTAILOR", "html"))
    html.checked_at = datetime.now(UTC) - timedelta(days=2)
    await db.commit()
    counts = await bd.validate_candidates(db, 100, time.monotonic() + 60, limiter=no_wait)
    assert counts["checked"] == 2
    assert counts["dead"] == 2
    assert (await db.get(JobBoardCandidate, ("LEVER", "gone"))).status == "not_found"
    # Out of time: nothing is checked.
    db.add(JobBoardCandidate(source="LEVER", token="later", origin="x"))
    await db.commit()
    assert (await bd.validate_candidates(db, 100, time.monotonic() - 1))["checked"] == 0
    summary = await bd.board_counts(db)
    assert summary == {"boards_live": 3, "candidates_pending": 1}


def test_count_jobs_formats():
    j = lambda body, ct="application/json": httpx.Response(200, text=body, headers={"content-type": ct})  # noqa: E731
    assert bd._count_jobs(j("[1,2]")) == 2
    assert bd._count_jobs(j('{"totalFound": 4}')) == 4
    assert bd._count_jobs(j('{"x": 1}')) is None
    assert bd._count_jobs(j("{bad")) is None
    assert bd._count_jobs(j("<?xml version='1.0'?><rss><item/><item/></rss>", "text/xml")) == 2
    assert bd._count_jobs(j("<html/>", "text/html")) is None


@pytest.mark.asyncio
async def test_import_404s_retire_live_boards(db, monkeypatch):
    monkeypatch.setattr(settings, "JOB_BOARD_DEAD_AFTER_404S", 2)
    db.add_all(
        [
            JobSourceBoard(source="LEVER", token="a", fail_count=1),
            JobSourceBoard(source="LEVER", token="b", fail_count=1),
        ]
    )
    await db.commit()
    assert await bd.record_import_outcomes(db, "LEVER", {}) == 0
    assert await bd.record_import_outcomes(db, "LEVER", {"a": 404, "b": 200}) == 1
    a = await db.get(JobSourceBoard, ("LEVER", "a"))
    b = await db.get(JobSourceBoard, ("LEVER", "b"))
    assert a.status == "not_found"
    assert b.fail_count == 0


def _job(ext: str, url: str, description: str = "d", source: str = "HIMALAYAS") -> JobPost:
    return JobPost(
        title="Dev",
        slug=f"dev-{ext}",
        description=description,
        company_name="Co",
        external_id=ext,
        external_url=url,
        source=source,
        last_seen_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_run_discovery_scans_jobs_and_seed_lists(db, mock_http, monkeypatch):
    from app.domains.jobs.aggregators import board_lists

    monkeypatch.setattr(settings, "ATS_BUNDLED_LISTS", False)
    for source in board_lists.BOARD_SOURCES:
        monkeypatch.setattr(settings, board_lists.BOARD_SOURCES[source][1], "")
    db.add_all(
        [
            _job("h1", "https://boards.greenhouse.io/newco/jobs/1"),
            _job("h2", "https://example.com/apply", "Apply at https://jobs.lever.co/otherco/1"),
        ]
    )
    await db.commit()
    monkeypatch.setattr(settings, "JOB_BOARD_SEED_URLS", "https://lists.example/boards.txt,ftp://x")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "lists.example":
            return httpx.Response(200, text="https://seedco.recruitee.com/\n")
        if "newco" in str(request.url):
            return httpx.Response(200, json={"jobs": [{"id": 1}]})
        return httpx.Response(404)

    mock_http["handler"] = handler
    monkeypatch.setattr(settings, "JOB_BOARD_HOST_INTERVAL_SECONDS", 0)
    result = await bd.run_discovery(db)
    assert result["jobs_scanned"] == 2
    assert result["new_candidates"] == 3
    assert result["validated_promoted"] == 1
    assert result["boards_live"] == 1
    cp = await db.get(JobImportCheckpoint, bd.CHECKPOINT)
    assert cp.cursor["scan_after"]
    # The next run scans only newer jobs.
    again = await bd.run_discovery(db)
    assert again["jobs_scanned"] == 0
    assert again["new_candidates"] == 0


@pytest.mark.asyncio
async def test_sync_expires_after_complete_sweep_and_removals_and_records_links(db, monkeypatch):
    class Sweep(GreenhouseAggregator):
        source_name = "SWEEP"

        async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
            self.sweep_started = datetime.now(UTC)
            self.removed_ids = ["sweep_closed"]
            job = self._job(
                ext_id="fresh",
                title="Engineer",
                company="Co",
                url="https://jobs.ashbyhq.com/NewCo/1",
                description="x",
                location="Berlin",
            )
            return [job] if job else []

    old = datetime.now(UTC) - timedelta(days=3)
    stale = _job("sweep_stale", "https://a.example/1", source="SWEEP")
    stale.last_seen_at = old
    closed = _job("sweep_closed", "https://a.example/2", source="SWEEP")
    db.add_all([stale, closed])
    await db.commit()
    service = JobService(JobRepository(db))
    service.aggregators = [Sweep()]
    stats = await service.sync_all_job_sources(source_name="SWEEP", run_maintenance=False)
    assert stats["SWEEP"] == 1
    rows = {j.external_id: j for j in (await db.execute(select(JobPost))).scalars()}
    assert rows["sweep_stale"].expired_at is not None
    assert rows["sweep_closed"].expired_at is not None
    assert rows["sweep_fresh"].expired_at is None
    assert await db.get(JobBoardCandidate, ("ASHBY", "NewCo")) is not None


@pytest.mark.asyncio
async def test_discovery_task_reports_to_slack(monkeypatch):
    from conftest import TestingSessionLocal

    from app.domains.tasks.service import TASK_DISCOVER_BOARDS, TaskService
    from app.worker import runtime, tasks

    monkeypatch.setattr(runtime, "session_factory", lambda: TestingSessionLocal)
    monkeypatch.setattr(settings, "TASKS_DISPATCH_DISABLED", True)
    posts: list[str] = []

    async def fake_post(channel, text, **kw):  # noqa: ANN001
        posts.append(f"{channel}:{text}")
        return True

    from app.services import slack

    monkeypatch.setattr(slack, "post", fake_post)

    async def fake_run(db):  # noqa: ANN001
        return {"new_candidates": 4, "validated_checked": 3, "validated_promoted": 2, "boards_live": 9}

    monkeypatch.setattr(bd, "run_discovery", fake_run)
    async with TestingSessionLocal() as db:
        run, _ = await TaskService(db).enqueue(TASK_DISCOVER_BOARDS, {}, idempotency_key=f"d{uuid.uuid4()}")
    result = await tasks.discover_boards_async(run.id)
    assert result["boards_live"] == 9
    assert posts
    assert posts[0].startswith("job_imports:")
    assert "4 new boards" in posts[0]

    async def broken(db):  # noqa: ANN001
        raise RuntimeError("boom")

    monkeypatch.setattr(bd, "run_discovery", broken)
    async with TestingSessionLocal() as db:
        run, _ = await TaskService(db).enqueue(TASK_DISCOVER_BOARDS, {}, idempotency_key=f"d{uuid.uuid4()}")
    await tasks.discover_boards_async(run.id)
    assert "failed" in posts[-1]

    monkeypatch.setattr(runtime, "run", lambda coro: (coro.close(), {"ran": True})[1])
    assert tasks.discover_boards_scheduled() == {"ran": True}
    monkeypatch.setattr(settings, "JOB_BOARD_DISCOVERY_ENABLED", False)
    assert tasks.discover_boards_scheduled() == {"skipped": "disabled"}


@pytest.mark.asyncio
async def test_france_travail_splits_busy_windows_by_departement(mock_http, monkeypatch):
    from app.domains.jobs.aggregators.government import DEPARTEMENTS, FranceTravailAggregator

    monkeypatch.setattr(settings, "FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setattr(settings, "FRANCE_TRAVAIL_CLIENT_SECRET", "secret")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "entreprise.francetravail.fr":
            return httpx.Response(200, json={"access_token": "t"})
        dep = request.url.params.get("departement")
        if dep is None:
            return httpx.Response(
                206, json={"resultats": []}, headers={"content-range": "offres 0-149/9000"}
            )
        if dep != "75":
            return httpx.Response(204)
        item = {
            "id": "X1",
            "intitule": "Développeur",
            "entreprise": {"nom": "SA"},
            "lieuTravail": {"libelle": "Paris"},
        }
        return httpx.Response(
            200, json={"resultats": [item]}, headers={"content-range": "offres 0-0/1"}
        )

    mock_http["handler"] = handler
    agg = FranceTravailAggregator()
    jobs = await agg.fetch_jobs(limit=100)
    assert [j.external_id for j in jobs] == ["francetravail_X1"]
    deps = [
        r.url.params.get("departement")
        for r in mock_http["seen"]
        if r.url.host == "api.francetravail.io"
    ]
    assert deps[1:] == list(DEPARTEMENTS)
    assert "since" in agg.next_cursor

    # Out of requests before every département was read: the window is kept.
    monkeypatch.setattr(settings, "FRANCE_TRAVAIL_MAX_PAGES", 3)
    agg2 = FranceTravailAggregator()
    await agg2.fetch_jobs(limit=100)
    assert agg2.next_cursor is None
