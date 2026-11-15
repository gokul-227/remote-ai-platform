"""Global job sources: more ATSes, public employment services, remote feeds,
board rotation/checkpoints, robots.txt, board validation and retention.
Recorded fixtures only (tests/fixtures/jobs); no network."""

import json
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from sqlalchemy import select

import app.domains.jobs.aggregators.public_boards as pb
from app.core.config import settings
from app.domains.jobs.aggregators import board_lists, robots
from app.domains.jobs.aggregators.base import SourceDisabledError, SourceFetchError
from app.domains.jobs.aggregators.government import (
    BundesagenturAggregator,
    CareerjetAggregator,
    FranceTravailAggregator,
    JobTechAggregator,
    NAVAggregator,
)
from app.domains.jobs.aggregators.more_ats import (
    BambooHRAggregator,
    BreezyAggregator,
    PersonioAggregator,
    RecruiteeAggregator,
    RipplingAggregator,
    TeamtailorAggregator,
    WorkdayAggregator,
    workday_posted,
)
from app.domains.jobs.aggregators.remote_feeds import GetOnBoardAggregator, RemoteRSSAggregator
from app.domains.jobs.board_validation import (
    active_boards,
    board_summary,
    sync_board_rows,
    validate_boards,
)
from app.domains.jobs.models import JobPost
from app.domains.jobs.repository import JobRepository
from app.domains.jobs.service import AGGREGATORS, JobService
from app.domains.tasks.models import JobSource, JobSourceBoard

FIX = Path(__file__).parent / "fixtures" / "jobs"


def fx(name: str) -> bytes:
    return (FIX / name).read_bytes()


ROUTES: dict[str, tuple[str, str]] = {
    "recruitee.com": ("recruitee_tellent.json", "application/json"),
    "jobs.personio.de": ("personio_personio.xml", "text/xml"),
    "teamtailor.com": ("teamtailor_career.rss", "application/rss+xml"),
    "bamboohr.com": ("bamboohr_alma.json", "application/json"),
    "breezy.hr": ("breezy_breezy.json", "application/json"),
    "api.rippling.com": ("rippling_rippling.json", "application/json"),
    "myworkdayjobs.com": ("workday_nvidia.json", "application/json"),
    "rest.arbeitsagentur.de": ("bundesagentur_jobs.json", "application/json"),
    "jobsearch.api.jobtechdev.se": ("jobtech_search.json", "application/json"),
    "api.francetravail.io": ("francetravail_search.json", "application/json"),
    "search.api.careerjet.net": ("careerjet_query.json", "application/json"),
    "www.getonbrd.com": ("getonboard_search.json", "application/json"),
    "nodesk.co": ("nodesk_remote.rss", "application/rss+xml"),
}


@pytest.fixture
def net(monkeypatch):
    """Route every httpx request to a recorded fixture by host; record requests."""
    seen: list[httpx.Request] = []
    overrides: dict[str, httpx.Response] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        host = request.url.host
        for key, resp in overrides.items():
            if key in str(request.url):
                return resp
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        if host == "pam-stilling-feed.nav.no":
            if request.url.path == "/api/publicToken":
                return httpx.Response(200, text="Current public token:\naaa.bbb.ccc\n")
            return httpx.Response(200, content=fx("nav_feed_last.json"))
        if host == "entreprise.francetravail.fr":
            return httpx.Response(200, json={"access_token": "t", "expires_in": 1499})
        for suffix, (name, ctype) in ROUTES.items():
            if host.endswith(suffix):
                return httpx.Response(200, content=fx(name), headers={"content-type": ctype})
        return httpx.Response(404)

    real = httpx.AsyncClient
    monkeypatch.setattr(
        pb.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw)
    )
    monkeypatch.setattr(settings, "JOB_SOURCE_REQUEST_DELAY_SECONDS", 0)
    monkeypatch.setattr(settings, "ATS_BOARD_SHARDS", 1)
    robots.clear_cache()
    return seen, overrides


def one_board(agg, token: str):
    agg.boards = [token]
    return agg


# ── ATS adapters ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_recruitee_maps_offers(net):
    jobs = await one_board(RecruiteeAggregator(), "tellent").fetch_jobs(limit=10)
    assert len(jobs) == 2
    j = jobs[0]
    assert j.source == "RECRUITEE"
    assert j.external_id.startswith("recruitee_tellent_")
    assert j.company_name == "Tellent"
    assert j.external_url.startswith("https://careers.tellent.com/")
    assert j.posted_at is not None
    assert j.salary_min == 53000
    assert j.currency == "EUR"


@pytest.mark.asyncio
async def test_personio_xml(net):
    jobs = await one_board(PersonioAggregator(), "personio").fetch_jobs()
    assert [j.title for j in jobs][0].startswith("Business Development")
    assert jobs[0].location == "Berlin"
    assert jobs[0].external_url == "https://personio.jobs.personio.de/job/2885178"


@pytest.mark.asyncio
async def test_teamtailor_rss_locations(net):
    jobs = await one_board(TeamtailorAggregator(), "career").fetch_jobs()
    assert jobs
    assert jobs[0].company_name == "Teamtailor"
    assert "Stockholm, Sweden" in jobs[0].location
    assert jobs[0].external_url.startswith("https://career.teamtailor.com/jobs/")


@pytest.mark.asyncio
async def test_bamboohr_breezy_rippling(net):
    bamboo = await one_board(BambooHRAggregator(), "alma").fetch_jobs()
    assert bamboo[0].external_url == "https://alma.bamboohr.com/careers/8"
    assert "Pennsylvania" in bamboo[0].location
    assert bamboo[0].job_type == "full-time"
    breezy = await one_board(BreezyAggregator(), "breezy").fetch_jobs()
    assert breezy[0].company_name == "MS Breezy Trial"
    assert breezy[1].job_type == "contract"
    rip = await one_board(RipplingAggregator(), "rippling").fetch_jobs()
    assert rip[0].title.startswith("Account Executive")
    assert rip[0].location == "AR"


@pytest.mark.asyncio
async def test_bamboohr_html_redirect_is_not_a_board(net):
    _, overrides = net
    overrides["nope.bamboohr.com"] = httpx.Response(
        200, text="<html>", headers={"content-type": "text/html"}
    )
    with pytest.raises(SourceFetchError):
        await one_board(BambooHRAggregator(), "nope").fetch_jobs()


@pytest.mark.asyncio
async def test_workday_sites_and_posted_text(net):
    jobs = await one_board(WorkdayAggregator(), "nvidia/wd5/NVIDIAExternalCareerSite").fetch_jobs()
    assert jobs
    assert jobs[0].external_url.startswith(
        "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/"
    )
    now = datetime(2026, 11, 15, tzinfo=UTC)
    assert workday_posted("Posted Today", now) == now
    assert workday_posted("Posted Yesterday", now) == now - timedelta(days=1)
    assert workday_posted("Posted 30+ Days Ago", now) == now - timedelta(days=30)
    assert workday_posted("soon", now) is None


@pytest.mark.asyncio
async def test_workday_robots_blocked(net, monkeypatch):
    _, overrides = net
    monkeypatch.setattr(settings, "JOB_SOURCE_RESPECT_ROBOTS", True)
    overrides["myworkdayjobs.com/robots.txt"] = httpx.Response(
        200, text="User-agent: *\nDisallow: /wday/\n"
    )
    with pytest.raises(SourceDisabledError):
        await one_board(WorkdayAggregator(), "nvidia/wd5/NVIDIAExternalCareerSite").fetch_jobs()


# ── robots.txt ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_robots_rules_and_failures(net, monkeypatch):
    seen, overrides = net
    monkeypatch.setattr(settings, "JOB_SOURCE_RESPECT_ROBOTS", True)
    overrides["api.smartrecruiters.com/robots.txt"] = httpx.Response(
        200, text="User-agent: LinkedInBot\nAllow: /v1/companies/\nUser-agent: *\nDisallow: /\n"
    )
    overrides["down.example/robots.txt"] = httpx.Response(503)
    async with httpx.AsyncClient() as c:
        assert not await robots.allowed(
            c, "https://api.smartrecruiters.com/v1/companies/x/postings"
        )
        assert await robots.allowed(
            c, "https://tellent.recruitee.com/api/offers/"
        )  # 404 = no rules
        assert not await robots.allowed(c, "https://down.example/feed")  # 5xx = assume disallowed
        before = len(seen)
        await robots.allowed(c, "https://api.smartrecruiters.com/v1/companies/y/postings")
        assert len(seen) == before  # cached per host


@pytest.mark.asyncio
async def test_source_fully_blocked_by_robots_is_disabled(net, monkeypatch):
    _, overrides = net
    monkeypatch.setattr(settings, "JOB_SOURCE_RESPECT_ROBOTS", True)
    overrides["tellent.recruitee.com/robots.txt"] = httpx.Response(
        200, text="User-agent: *\nDisallow: /\n"
    )
    with pytest.raises(SourceDisabledError):
        await one_board(RecruiteeAggregator(), "tellent").fetch_jobs()


# ── rotation over long board lists ───────────────────────────────────────────


def test_board_rotation_uses_checkpoint(monkeypatch):
    monkeypatch.setattr(settings, "ATS_BOARDS_PER_RUN", 3)
    agg = RecruiteeAggregator()
    boards = [f"b{i}" for i in range(7)]
    first = agg.pick_boards(boards)
    assert first == ["b0", "b1", "b2"]
    assert agg.next_cursor == {"offset": 3, "boards": 7}
    agg.cursor = {"offset": 6}
    assert agg.pick_boards(boards) == ["b6", "b0", "b1"]
    assert agg.next_cursor["offset"] == 2
    monkeypatch.setattr(settings, "ATS_BOARDS_PER_RUN", 100)
    agg.next_cursor = None
    monkeypatch.setattr(settings, "ATS_BOARD_SHARDS", 1)
    assert agg.pick_boards(boards) == boards
    assert agg.next_cursor is None


def test_bundled_lists_are_loaded_and_deduplicated(monkeypatch):
    monkeypatch.setattr(settings, "ATS_BUNDLED_LISTS", True)
    monkeypatch.setattr(settings, "RECRUITEE_COMPANIES", "Zeta,zeta")
    boards = board_lists.configured_boards("RECRUITEE")
    assert boards[0] == "Zeta"
    assert [b.lower() for b in boards].count("zeta") == 1
    for source, (filename, _setting) in board_lists.BOARD_SOURCES.items():
        assert (board_lists.DATA_DIR / filename).exists(), source
    assert len(board_lists.configured_boards("GREENHOUSE")) > 300
    assert len(board_lists.configured_boards("LEVER")) > 200


# ── government / public APIs ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_bundesagentur_incremental(net):
    seen, _ = net
    agg = BundesagenturAggregator()
    agg.cursor = {"since": (datetime.now(UTC) - timedelta(days=2)).isoformat()}
    jobs = await agg.fetch_jobs(limit=50)
    assert jobs[0].title.startswith("Lokalreporter")
    assert (
        jobs[0].external_url
        == "https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1004016176-S"
    )
    assert "Germany" in jobs[0].location
    assert jobs[0].salary_min == 36000
    req = [r for r in seen if r.url.host == "rest.arbeitsagentur.de"][0]
    assert req.headers["X-API-Key"] == "jobboerse-jobsuche"
    assert req.url.params["veroeffentlichtseit"] == "3"
    assert "since" in agg.next_cursor


@pytest.mark.asyncio
async def test_bundesagentur_disabled_without_key(monkeypatch):
    monkeypatch.setattr(settings, "BUNDESAGENTUR_API_KEY", "")
    with pytest.raises(SourceDisabledError):
        await BundesagenturAggregator().fetch_jobs()


@pytest.mark.asyncio
async def test_jobtech_published_after(net):
    seen, _ = net
    agg = JobTechAggregator()
    jobs = await agg.fetch_jobs(limit=10)
    assert len(jobs) == 2
    assert "Sweden" in jobs[0].location
    assert jobs[0].external_url.startswith("https://arbetsformedlingen.se/platsbanken/annonser/")
    assert "published-after" in seen[-1].url.params
    assert agg.next_cursor


@pytest.mark.asyncio
async def test_nav_feed_cursor_and_public_token(net):
    seen, _ = net
    agg = NAVAggregator()
    jobs = await agg.fetch_jobs()
    assert jobs
    assert jobs[0].external_url.startswith("https://arbeidsplassen.nav.no/stillinger/stilling/")
    assert any(r.headers.get("Authorization") == "Bearer aaa.bbb.ccc" for r in seen)
    assert agg.next_cursor == {"page": "5214f8c4-032e-4dee-9655-7a8e437cfab7"}
    agg2 = NAVAggregator()
    agg2.cursor = agg.next_cursor
    await agg2.fetch_jobs()
    assert seen[-1].url.path.endswith("/5214f8c4-032e-4dee-9655-7a8e437cfab7")


@pytest.mark.asyncio
async def test_france_travail_and_careerjet_need_keys(net, monkeypatch):
    with pytest.raises(SourceDisabledError):
        await FranceTravailAggregator().fetch_jobs()
    with pytest.raises(SourceDisabledError):
        await CareerjetAggregator().fetch_jobs()
    monkeypatch.setattr(settings, "FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setattr(settings, "FRANCE_TRAVAIL_CLIENT_SECRET", "secret")
    ft = await FranceTravailAggregator().fetch_jobs()
    assert ft[0].company_name == "ACME SAS"
    assert "France" in ft[0].location
    assert ft[1].external_url.endswith("/196XKQQ")
    monkeypatch.setattr(settings, "CAREERJET_API_KEY", "k")
    monkeypatch.setattr(settings, "CAREERJET_LOCALES", "en_GB")
    cj = await CareerjetAggregator().fetch_jobs()
    assert cj[0].salary_min == 60000
    assert cj[1].salary_min is None


@pytest.mark.asyncio
async def test_adzuna_pages_and_max_days(net, monkeypatch):
    seen, overrides = net
    monkeypatch.setattr(settings, "ADZUNA_LICENSE_CONFIRMED", True)
    monkeypatch.setattr(settings, "ADZUNA_APP_ID", "a")
    monkeypatch.setattr(settings, "ADZUNA_APP_KEY", "b")
    monkeypatch.setattr(settings, "ADZUNA_COUNTRIES", "gb")
    overrides["api.adzuna.com"] = httpx.Response(
        200, json={"results": [{"id": 1, "title": "Dev", "created": "2026-11-14T00:00:00Z"}]}
    )
    agg = pb.AdzunaAggregator()
    agg.cursor = {"since": (datetime.now(UTC) - timedelta(days=1)).isoformat()}
    jobs = await agg.fetch_jobs(limit=100)
    assert len(jobs) == 1
    assert seen[-1].url.params["max_days_old"] == "2"
    assert agg.next_cursor


# ── remote feeds ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_getonboard_and_remote_rss(net, monkeypatch):
    gob = await GetOnBoardAggregator().fetch_jobs()
    assert gob[0].company_name == "23people"
    assert gob[0].external_url.startswith("https://www.getonbrd.com/jobs/")
    monkeypatch.setattr(settings, "REMOTE_RSS_FEEDS", "https://nodesk.co/remote-jobs/index.xml")
    rss = await RemoteRSSAggregator().fetch_jobs()
    assert rss[0].title == "Staff Software Engineer"
    assert rss[0].company_name == "Rebuy"
    assert rss[0].is_remote


# ── service, checkpoints, board rows, validation ─────────────────────────────


def test_every_new_source_is_registered():
    names = {a.source_name for a in AGGREGATORS}
    for n in (
        "RECRUITEE", "PERSONIO", "TEAMTAILOR", "BAMBOOHR", "BREEZY", "RIPPLING", "WORKDAY",
        "BUNDESAGENTUR", "JOBTECH", "NAV", "FRANCETRAVAIL", "CAREERJET", "GETONBOARD", "REMOTE_RSS",
    ):  # fmt: skip
        assert n in names


@pytest.mark.asyncio
async def test_sync_uses_board_rows_and_returns_cursor(db, net, monkeypatch):
    monkeypatch.setattr(settings, "RECRUITEE_COMPANIES", "tellent,gone")
    assert await sync_board_rows(db, "RECRUITEE") == 2
    assert await sync_board_rows(db, "RECRUITEE") == 0
    gone = await db.get(JobSourceBoard, ("RECRUITEE", "gone"))
    gone.status = "not_found"
    await db.commit()
    assert await active_boards(db, "RECRUITEE") == ["tellent"]
    assert await active_boards(db, "LEVER") is None
    service = JobService(JobRepository(db))
    stats = await service.sync_all_job_sources(
        source_name="RECRUITEE", run_maintenance=False, cursors={"RECRUITEE": {"offset": 0}}
    )
    assert stats["RECRUITEE"] == 2
    jt = await service.sync_all_job_sources(source_name="JOBTECH", run_maintenance=False)
    assert jt["JOBTECH"] == 2
    assert "since" in service.next_cursors["JOBTECH"]


@pytest.mark.asyncio
async def test_validate_boards_is_rate_limited(db, net, monkeypatch):
    _, overrides = net
    monkeypatch.setattr(settings, "RECRUITEE_COMPANIES", "tellent,missing,empty")
    overrides["missing.recruitee.com"] = httpx.Response(404)
    overrides["empty.recruitee.com"] = httpx.Response(200, json={"offers": []})
    db.add(JobSource(name="RECRUITEE", rate_limit_per_minute=30))
    await db.commit()
    pauses: list[float] = []

    async def fake_sleep(s: float) -> None:
        pauses.append(s)

    counts = await validate_boards(db, "recruitee", 10, sleep=fake_sleep)
    assert counts == {"ok": 1, "not_found": 1, "empty": 1}
    assert pauses == [2.0, 2.0]
    summary = await board_summary(db)
    assert summary["RECRUITEE"] == {"ok": 1, "not_found": 1, "empty": 1}
    row = await db.get(JobSourceBoard, ("RECRUITEE", "tellent"))
    assert row.job_count == 2
    assert row.checked_at is not None
    with pytest.raises(KeyError):
        await validate_boards(db, "JOBTECH")


@pytest.mark.asyncio
async def test_new_sources_registered_with_cadence_and_permission(db):
    from app.domains.tasks.service import TaskService

    await TaskService(db).ensure_sources([a.source_name for a in AGGREGATORS])
    rows = {s.name: s for s in (await db.execute(select(JobSource))).scalars()}
    assert rows["JOBTECH"].cron == "25 * * * *"
    assert rows["WORKDAY"].permission_confirmed is False
    assert rows["REMOTE_RSS"].permission_confirmed is False
    assert rows["BUNDESAGENTUR"].permission_confirmed is True


@pytest.mark.asyncio
async def test_listings_hide_jobs_past_retention(db):
    old = datetime.now(UTC) - timedelta(days=settings.JOB_RETENTION_DAYS + 2)
    for title, posted in (("Old", old), ("New", datetime.now(UTC))):
        db.add(
            JobPost(
                id=uuid.uuid4(),
                title=title,
                slug=f"{title.lower()}-{uuid.uuid4().hex[:6]}",
                description="x",
                company_name="Acme",
                location="Remote",
                is_remote=True,
                job_type="full-time",
                skills=[],
                source="JOBTECH",
                external_id=f"jobtech_{title}",
                posted_at=posted,
            )
        )
    await db.commit()
    rows = await JobRepository(db).search(skip=0, limit=10)
    assert [j.title for j in rows] == ["New"]


@pytest.mark.asyncio
async def test_staff_board_endpoints(client, db, monkeypatch):
    from tests.test_background_tasks import _staff_headers

    admin_headers = await _staff_headers()
    monkeypatch.setattr(settings, "RECRUITEE_COMPANIES", "tellent")
    r = await client.get("/api/v1/admin/background/sources", headers=admin_headers)
    assert r.status_code == 200
    rec = next(s for s in r.json() if s["name"] == "RECRUITEE")
    assert rec["boards"] == {"unchecked": 1}
    r = await client.get("/api/v1/admin/background/sources/RECRUITEE/boards", headers=admin_headers)
    assert r.json()[0]["token"] == "tellent"
    r = await client.patch(
        "/api/v1/admin/background/sources/RECRUITEE/boards/tellent",
        json={"reason": "not hiring", "enabled": False},
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["enabled"] is False
    r = await client.patch(
        "/api/v1/admin/background/sources/RECRUITEE/boards/none",
        json={"reason": "x" * 3, "enabled": False},
        headers=admin_headers,
    )
    assert r.status_code == 404
    r = await client.post(
        "/api/v1/admin/background/sources/JOBTECH/boards/validate",
        json={"reason": "check"},
        headers=admin_headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_daily_summary_lists_sources(db, monkeypatch):
    from app.domains.tasks.models import TaskRun
    from app.worker import ops

    posts: list[dict] = []

    async def fake_post(channel, text, **kw):
        posts.append({"channel": channel, "text": text, **kw})
        return True

    monkeypatch.setattr(ops.slack, "post", fake_post)
    for src, n in (("JOBTECH", 5), ("NAV", 7), ("JOBTECH", 1)):
        db.add(
            TaskRun(
                task_name="jobs.import_source",
                idempotency_key=f"t:{uuid.uuid4().hex}",
                args={"source": src},
                status="SUCCEEDED",
                result={"source": src, "saved": n},
            )
        )
    await db.commit()
    out = await ops.daily_import_summary(db)
    assert out["by_source"] == {"JOBTECH": 6, "NAV": 7}
    assert posts[0]["channel"] == "job_imports"
    assert posts[0]["fields"]["by source"] == "NAV 7, JOBTECH 6"


def test_fixtures_are_valid_json():
    for p in FIX.glob("*.json"):
        json.loads(p.read_text())
