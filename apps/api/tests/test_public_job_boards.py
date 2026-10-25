"""Public job sources (ATS boards and remote boards) and the imported-job retention rule. No network."""

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.domains.jobs.aggregators.public_boards as pb
from app.core.config import settings
from app.domains.applications.models import JobApplication
from app.domains.auth.models import User, UserRole
from app.domains.jobs.models import JobPost
from app.domains.jobs.repository import JobRepository

FEEDS = {
    "boards-api.greenhouse.io": {
        "jobs": [
            {
                "id": 1,
                "title": "Backend Engineer",
                "location": {"name": "Remote, US"},
                "absolute_url": "https://boards.greenhouse.io/acme/jobs/1",
                "content": "&lt;p&gt;Python and PostgreSQL&lt;/p&gt;",
            }
        ]
    },
    "api.lever.co": [
        {
            "id": "abc",
            "text": "Data Engineer",
            "hostedUrl": "https://jobs.lever.co/acme/abc",
            "descriptionPlain": "Spark and Airflow",
            "workplaceType": "remote",
            "categories": {"location": "Berlin", "commitment": "Full-time", "team": "Data"},
        }
    ],
    "api.ashbyhq.com": {
        "jobs": [
            {
                "id": "x1",
                "title": "Designer",
                "jobUrl": "https://jobs.ashbyhq.com/acme/x1",
                "descriptionPlain": "Figma",
                "location": "London",
                "employmentType": "FullTime",
                "isRemote": False,
            }
        ]
    },
    "jobicy.com": {
        "jobs": [
            {
                "id": 7,
                "jobTitle": "Support Lead",
                "companyName": "Acme",
                "url": "https://jobicy.com/jobs/7",
                "jobDescription": "Help customers",
                "jobGeo": "EMEA",
                "jobType": ["full-time"],
                "annualSalaryMin": 40000,
                "annualSalaryMax": 60000,
                "salaryCurrency": "EUR",
            }
        ]
    },
}


@pytest.fixture
def feeds(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=FEEDS[request.url.host])

    real = httpx.AsyncClient
    monkeypatch.setattr(
        pb.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw)
    )
    monkeypatch.setattr(settings, "GREENHOUSE_BOARDS", "acme")
    monkeypatch.setattr(settings, "LEVER_BOARDS", "acme")
    monkeypatch.setattr(settings, "ASHBY_BOARDS", "acme")
    monkeypatch.setattr(settings, "ATS_BOARD_SHARDS", 1)


@pytest.mark.asyncio
async def test_ats_and_remote_boards_normalise_jobs_with_source_links(feeds):
    gh = (await pb.GreenhouseAggregator().fetch_jobs(limit=10))[0]
    assert gh.external_url == "https://boards.greenhouse.io/acme/jobs/1"
    assert gh.external_id == "greenhouse_acme_1"
    assert gh.is_remote
    assert "Python" in gh.skills
    assert "<p>" not in gh.description
    lever = (await pb.LeverAggregator().fetch_jobs(limit=10))[0]
    assert lever.is_remote
    assert lever.job_type == "full-time"
    ashby = (await pb.AshbyAggregator().fetch_jobs(limit=10))[0]
    assert not ashby.is_remote
    assert ashby.location == "London"
    jobicy = (await pb.JobicyAggregator().fetch_jobs(limit=10))[0]
    assert (jobicy.salary_min, jobicy.salary_max, jobicy.currency) == (40000, 60000, "EUR")


@pytest.mark.asyncio
async def test_key_based_sources_are_disabled_without_keys(monkeypatch):
    from app.domains.jobs.aggregators.base import SourceDisabledError

    monkeypatch.setattr(settings, "ADZUNA_APP_ID", None)
    monkeypatch.setattr(settings, "JOOBLE_API_KEY", None)
    with pytest.raises(SourceDisabledError):
        await pb.AdzunaAggregator().fetch_jobs()
    with pytest.raises(SourceDisabledError):
        await pb.JoobleAggregator().fetch_jobs()


@pytest.mark.asyncio
async def test_old_imported_jobs_are_removed_unless_someone_applied(db: AsyncSession):
    old = datetime.now(UTC) - timedelta(days=120)

    def job(source: str, posted: datetime) -> JobPost:
        return JobPost(
            title="T",
            slug=f"t-{uuid.uuid4().hex[:8]}",
            description="d",
            company_name="C",
            source=source,
            posted_at=posted,
        )

    stale, applied, fresh, direct = (
        job("ARBEITNOW", old),
        job("REMOTEOK", old),
        job("ARBEITNOW", datetime.now(UTC)),
        job("DIRECT", old),
    )
    db.add_all([stale, applied, fresh, direct])
    user = User(
        email=f"r_{uuid.uuid4().hex[:6]}@example.com", full_name="R", role=UserRole.ENGINEER
    )
    db.add(user)
    await db.flush()
    db.add(JobApplication(user_id=user.id, job_id=applied.id, status="SUBMITTED"))
    await db.commit()
    stale_id, applied_id, fresh_id, direct_id = stale.id, applied.id, fresh.id, direct.id
    ids = {stale_id, applied_id, fresh_id, direct_id}

    removed, hidden = await JobRepository(db).purge_old_imported_jobs(90)
    await db.commit()
    db.expire_all()
    left = {
        j.id: j for j in (await db.execute(select(JobPost).where(JobPost.id.in_(ids)))).scalars()
    }
    assert stale_id not in left  # deleted
    assert left[applied_id].expired_at is not None  # kept for the applicant, hidden from the list
    assert left[fresh_id].expired_at is None
    assert left[direct_id].expired_at is None  # posted jobs are never touched
    assert removed == 1
    assert hidden == 1


def test_board_groups_rotate_and_cover_every_company(monkeypatch):
    from datetime import UTC, datetime

    monkeypatch.setattr(settings, "ATS_BOARD_SHARDS", 4)
    boards = [f"c{i}" for i in range(10)]
    seen = [pb._shard(boards, datetime(2030, 1, 1, h, tzinfo=UTC)) for h in (0, 3, 6, 9)]
    assert sorted(sum(seen, [])) == sorted(boards)  # four runs cover every board once
    assert all(len(g) <= 3 for g in seen)
    assert pb._shard(boards, datetime(2030, 1, 1, 12, tzinfo=UTC)) == seen[0]  # then it repeats


@pytest.mark.asyncio
async def test_size_budget_is_a_no_op_outside_postgres(db: AsyncSession):
    # SQLite in tests: no database size to measure, so nothing is ever trimmed.
    assert await JobRepository(db).trim_to_size_budget(1) == 0


@pytest.mark.asyncio
async def test_import_announces_new_jobs_and_per_source_runs_skip_maintenance(
    db: AsyncSession, monkeypatch
):
    from app.domains.jobs import service as svc
    from app.domains.jobs.schemas import JobPostCreate

    class Fake:
        source_name = "FAKE"

        async def fetch_jobs(self, limit: int = 100):
            return [
                JobPostCreate(
                    title="Fake role",
                    description="d",
                    company_name="C",
                    external_id=f"fake_{uuid.uuid4().hex}",
                    source="FAKE",
                )
            ]

    sent: list = []
    maintained: list = []

    async def fake_notify(ids):
        sent.append(ids)
        return {"google": 0, "indexnow": len(ids)}

    service = svc.JobService(JobRepository(db))
    service.aggregators = [Fake()]
    monkeypatch.setattr(svc, "notify_new_jobs", fake_notify)

    async def fake_maintain(self):
        maintained.append(True)
        return {}

    monkeypatch.setattr(svc.JobService, "maintain_catalogue", fake_maintain)
    await service.sync_all_job_sources(source_name="FAKE", run_maintenance=False)
    assert len(sent[0]) == 1  # the new job reached the search-engine notifier
    assert maintained == []
    await service.sync_all_job_sources()
    assert maintained == [True]


def test_long_fields_are_trimmed_to_column_limits():
    agg = pb.GreenhouseAggregator()
    places = ", ".join(f"City {i}" for i in range(80))  # ~600 characters of locations
    job = agg._job(
        ext_id="1", title="T" * 400, company="C" * 400, url=None, description="d", location=places
    )
    assert len(job.title) == 255
    assert len(job.company_name) == 255
    assert len(job.location) <= 255
    assert job.location.endswith("…")


@pytest.mark.asyncio
async def test_one_bad_job_never_discards_the_whole_source(db: AsyncSession, monkeypatch):
    from app.domains.jobs import service as svc
    from app.domains.jobs.schemas import JobPostCreate

    class Mixed:
        source_name = "MIXED"

        async def fetch_jobs(self, limit: int = 100):
            good = [
                JobPostCreate(
                    title=f"Role {i}",
                    description="d",
                    company_name="C",
                    external_id=f"mixed_{uuid.uuid4().hex}",
                    source="MIXED",
                )
                for i in range(3)
            ]
            bad = JobPostCreate(
                title="Bad",
                description="d",
                company_name="C",
                external_id="mixed_bad",
                source="MIXED",
            )
            return [good[0], bad, good[1], good[2]]

    real = JobRepository.upsert_external_job

    async def flaky(self, data):
        if data.external_id == "mixed_bad":
            raise ValueError("rejected by the database")
        return await real(self, data)

    monkeypatch.setattr(JobRepository, "upsert_external_job", flaky)

    async def no_notify(ids):
        return {}

    monkeypatch.setattr(svc, "notify_new_jobs", no_notify)
    service = svc.JobService(JobRepository(db))
    service.aggregators = [Mixed()]
    stats = await service.sync_all_job_sources(source_name="MIXED", run_maintenance=False)
    assert stats == {"MIXED": 3}


@pytest.mark.asyncio
async def test_hacker_news_who_is_hiring_posts_become_jobs(monkeypatch):
    thread = {"hits": [{"objectID": "99", "title": "Ask HN: Who is hiring? (October 2026)"}]}
    items = {
        "children": [
            {
                "id": 1,
                "text": "Acme (acme.io) | ONSITE | Senior Backend Engineer, SRE | Berlin, Germany<p>We use Python.",
            },
            {"id": 2, "text": "Just a comment without a role"},
        ]
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=thread if "search_by_date" in request.url.path else items)

    real = httpx.AsyncClient
    monkeypatch.setattr(
        pb.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw)
    )
    jobs = await pb.HackerNewsAggregator().fetch_jobs(limit=10)
    assert len(jobs) == 1
    j = jobs[0]
    assert (j.company_name, j.title, j.location) == (
        "Acme",
        "Senior Backend Engineer, SRE",
        "Berlin, Germany",
    )
    assert j.external_url == "https://news.ycombinator.com/item?id=1"
