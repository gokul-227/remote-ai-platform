"""Jobs at scale: new public sources (recorded fixtures, no network), posting dates,
storage normalisation, cross-source dedup and batched 90-day retention."""

import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.domains.jobs.aggregators.public_boards as pb
from app.core.config import settings
from app.domains.auth.models import User, UserRole
from app.domains.jobs.aggregators.base import (
    BaseAggregator,
    SourceFetchError,
    canonical_url,
    dedup_key,
    parse_posted_at,
)
from app.domains.jobs.models import JobPost
from app.domains.jobs.repository import JobRepository
from app.domains.jobs.schemas import JobPostCreate
from app.domains.jobs.service import AGGREGATORS, JobService, prepare_for_storage
from app.domains.saved_jobs.models import SavedJob

FIXTURES = Path(__file__).parent / "fixtures" / "jobs"


@pytest.fixture
def recorded(monkeypatch):
    """Serve recorded responses by host; any other host fails the test."""
    bodies = {
        "apply.workable.com": (FIXTURES / "workable_acme.json").read_bytes(),
        "weworkremotely.com": (FIXTURES / "weworkremotely_programming.rss").read_bytes(),
    }
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(200, content=bodies[request.url.host])

    real = httpx.AsyncClient
    monkeypatch.setattr(
        pb.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw)
    )
    monkeypatch.setattr(settings, "WORKABLE_ACCOUNTS", "acme")
    monkeypatch.setattr(settings, "WEWORKREMOTELY_FEEDS", "remote-programming-jobs")
    monkeypatch.setattr(settings, "ATS_BOARD_SHARDS", 1)
    monkeypatch.setattr(settings, "JOB_SOURCE_REQUEST_DELAY_SECONDS", 0)
    return seen


@pytest.mark.asyncio
async def test_workable_adapter_normalises_recorded_feed(recorded):
    jobs = await pb.WorkableAggregator().fetch_jobs(limit=10)
    assert recorded == ["https://apply.workable.com/api/v1/widget/accounts/acme?details=true"]
    remote, office = jobs
    assert remote.external_id == "workable_acme_A1B2C3D4E5"
    assert remote.company_name == "Acme Robotics"
    assert remote.is_remote
    assert remote.location == "Remote (Berlin, Germany)"
    assert remote.job_type == "full-time"
    assert {"FastAPI", "Docker", "AWS"} <= set(remote.skills)
    assert "<p>" not in remote.description
    assert remote.posted_at == datetime(2026, 11, 10, tzinfo=UTC)
    assert not office.is_remote
    assert office.location == "Athens, Greece"


@pytest.mark.asyncio
async def test_weworkremotely_adapter_parses_recorded_rss(recorded):
    jobs = await pb.WeWorkRemotelyAggregator().fetch_jobs(limit=10)
    first = jobs[0]
    assert (first.company_name, first.title) == ("Globex", "Staff Backend Developer")
    assert first.external_id == "weworkremotely_globex-staff-backend-developer"
    assert first.external_url == "https://weworkremotely.com/remote-jobs/globex-staff-backend-developer"
    assert first.location == "Remote (Anywhere in the World)"
    assert first.posted_at == datetime(2026, 11, 12, 9, 30, tzinfo=UTC)
    assert "Kubernetes" in first.skills
    assert jobs[1].job_type == "contract"


def test_rss_parser_rejects_non_rss_and_does_not_expand_entities():
    with pytest.raises(SourceFetchError):
        pb._rss_items(b"<html><body>nope</body></html>")
    with pytest.raises(SourceFetchError):
        pb._rss_items(b"not xml")
    bomb = (
        b'<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaaaaaaaa">]>'
        b"<rss><channel><item><title>&a;</title></item></channel></rss>"
    )
    items = pb._rss_items(bomb)
    assert "aaaaaaaaaa" not in (items[0].get("title") or "")


def test_new_sources_are_registered_and_reach_the_staff_console():
    names = {a.source_name for a in AGGREGATORS}
    assert {"WORKABLE", "WEWORKREMOTELY"} <= names
    from app.domains.jobs.source_policy import SEARCH_SYNDICATION_BLOCKED_SOURCES

    assert "WEWORKREMOTELY" in SEARCH_SYNDICATION_BLOCKED_SOURCES


@pytest.mark.asyncio
async def test_new_sources_get_job_source_rows(db: AsyncSession):
    from app.domains.tasks.models import JobSource
    from app.domains.tasks.service import TaskService

    await TaskService(db).ensure_sources([a.source_name for a in AGGREGATORS])
    rows = {s.name: s for s in (await db.execute(select(JobSource))).scalars()}
    assert rows["WORKABLE"].enabled
    assert rows["WEWORKREMOTELY"].enabled


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (1767225600, datetime(2026, 1, 1, tzinfo=UTC)),
        (1767225600000, datetime(2026, 1, 1, tzinfo=UTC)),
        ("1767225600", datetime(2026, 1, 1, tzinfo=UTC)),
        ("2026-01-01T00:00:00Z", datetime(2026, 1, 1, tzinfo=UTC)),
        ("2026-01-01", datetime(2026, 1, 1, tzinfo=UTC)),
        ("Thu, 01 Jan 2026 00:00:00 +0000", datetime(2026, 1, 1, tzinfo=UTC)),
        ("garbage", None),
        (None, None),
        (True, None),
        ([], None),
    ],
)
def test_parse_posted_at(raw, expected):
    assert parse_posted_at(raw) == expected


def test_parse_posted_at_clamps_future_dates():
    future = (datetime.now(UTC) + timedelta(days=30)).isoformat()
    assert parse_posted_at(future) <= datetime.now(UTC)


def test_canonical_url_and_dedup_key():
    assert (
        canonical_url("HTTPS://Jobs.Example.com/a/b/?utm_source=x&id=3&gh_src=y#apply")
        == "https://jobs.example.com/a/b?id=3"
    )
    assert canonical_url("javascript:alert(1)") is None
    assert canonical_url(None) is None
    assert dedup_key("Senior  Engineer!", "ACME, Inc.", "Remote") == dedup_key(
        "senior engineer", "acme inc", "remote"
    )
    assert dedup_key("Engineer", "Acme", "Berlin") != dedup_key("Engineer", "Acme", "Paris")
    assert len(dedup_key("x", None, None)) == 32


def _job(ext: str, title: str = "Backend Engineer", **kw) -> JobPostCreate:
    return JobPostCreate(
        title=title,
        description=kw.pop("description", "Python"),
        company_name=kw.pop("company_name", "Acme"),
        location=kw.pop("location", "Remote"),
        external_id=ext,
        source=kw.pop("source", "TEST"),
        **kw,
    )


def test_prepare_for_storage_caps_cleans_and_drops_old(monkeypatch):
    monkeypatch.setattr(settings, "JOB_DESCRIPTION_MAX_CHARS", 100)
    old = datetime.now(UTC) - timedelta(days=settings.JOB_RETENTION_DAYS + 1)
    out = prepare_for_storage(
        [
            _job("a", description="x" * 500, company_logo="data:image/png;base64,AAAA",
                 external_url="https://x.example/j/1?utm_medium=feed"),
            _job("b"),  # same title/company/location as "a": dropped
            _job("c", title="Old role", posted_at=old),
            _job("d", title="Designer", company_logo="https://x.example/logo.png"),
        ]
    )
    assert [j.external_id for j in out] == ["a", "d"]
    assert len(out[0].description) == 100
    assert out[0].description.endswith("…")
    assert out[0].company_logo is None
    assert out[0].external_url == "https://x.example/j/1"
    assert out[0].dedup_key == dedup_key("Backend Engineer", "Acme", "Remote")
    assert out[1].company_logo == "https://x.example/logo.png"


class _Fake(BaseAggregator):
    def __init__(self, name: str, jobs: list[JobPostCreate]):
        self.source_name = name
        self._jobs = jobs

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        return self._jobs[:limit]


@pytest.mark.asyncio
async def test_same_posting_from_two_sources_is_stored_once(db: AsyncSession, monkeypatch):
    tag = uuid.uuid4().hex[:8]
    monkeypatch.setattr("app.domains.jobs.service.notify_new_jobs", _no_notify)
    service = JobService(JobRepository(db))
    title = f"Platform Engineer {tag}"
    first = _job(f"one_{tag}", title=title, source="ONE",
                 external_url=f"https://acme.example/jobs/{tag}?utm_source=one",
                 posted_at=datetime.now(UTC) - timedelta(days=3))
    same_elsewhere = _job(f"two_{tag}", title=title.upper(), source="TWO", company_name="ACME")
    same_url = _job(f"three_{tag}", title=f"Different {tag}", source="THREE",
                    external_url=f"https://acme.example/jobs/{tag}/")
    service.aggregators = [_Fake("ONE", [first]), _Fake("TWO", [same_elsewhere]),
                           _Fake("THREE", [same_url])]
    stats = await service.sync_all_job_sources(run_maintenance=False)
    assert stats == {"ONE": 1, "TWO": 0, "THREE": 0}
    rows = (await db.execute(select(JobPost).where(JobPost.title.ilike(f"%{tag}%")))).scalars().all()
    assert [r.external_id for r in rows] == [f"one_{tag}"]
    assert rows[0].external_url == f"https://acme.example/jobs/{tag}"
    assert rows[0].posted_at.date() == (datetime.now(UTC) - timedelta(days=3)).date()


async def _no_notify(ids):  # noqa: ANN001, ANN202
    return {}


@pytest.mark.asyncio
async def test_retention_keeps_saved_and_applied_jobs_and_works_in_batches(db: AsyncSession):
    from app.domains.applications.models import JobApplication

    old = datetime.now(UTC) - timedelta(days=120)

    def job(posted: datetime) -> JobPost:
        return JobPost(title="T", slug=f"t-{uuid.uuid4().hex[:8]}", description="d",
                       company_name="C", source="ARBEITNOW", posted_at=posted)

    stale = [job(old) for _ in range(5)]
    saved, applied, fresh = job(old), job(old), job(datetime.now(UTC))
    db.add_all([*stale, saved, applied, fresh])
    user = User(email=f"k_{uuid.uuid4().hex[:6]}@example.com", full_name="K", role=UserRole.ENGINEER)
    db.add(user)
    await db.flush()
    db.add(SavedJob(user_id=user.id, job_id=saved.id))
    db.add(JobApplication(user_id=user.id, job_id=applied.id, status="SUBMITTED"))
    await db.commit()
    ids = {j.id for j in [*stale, saved, applied, fresh]}
    saved_id, applied_id, fresh_id = saved.id, applied.id, fresh.id

    removed, hidden = await JobRepository(db).purge_old_imported_jobs(90, batch_size=2)
    db.expire_all()
    left = {j.id: j for j in (await db.execute(select(JobPost).where(JobPost.id.in_(ids)))).scalars()}
    assert removed == 5
    assert hidden == 2
    assert set(left) == {saved_id, applied_id, fresh_id}
    assert left[saved_id].expired_at is not None
    assert left[applied_id].expired_at is not None
    assert left[fresh_id].expired_at is None
    # The saved entry survives retention.
    assert (await db.execute(select(SavedJob).where(SavedJob.job_id == saved_id))).scalar_one()
    # Expired jobs leave the sitemap.
    sitemap_ids = {e[0] for e in await JobRepository(db).sitemap_entries(0, 10000)}
    assert saved_id not in sitemap_ids
    assert applied_id not in sitemap_ids


@pytest.mark.asyncio
async def test_size_budget_zero_disables_trimming(db: AsyncSession):
    assert await JobRepository(db).trim_to_size_budget(0) == 0
