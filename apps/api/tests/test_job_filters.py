"""Job search filters: derivation rules, filter queries, facets, saved searches,
alerts and the backfill (SQLite; PostgreSQL in test_postgres_job_filters.py)."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.domains.jobs import derive as d
from app.domains.jobs.schemas import JobPostCreate
from app.domains.jobs.service import prepare_for_storage

# ── derivation ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("location", "title", "remote", "expected"),
    [
        ("Berlin (Hybrid)", "Engineer", False, "hybrid"),
        ("Remote or hybrid, London", "Engineer", True, "hybrid"),
        ("New York, NY", "Engineer (On-site)", True, "onsite"),
        ("Remote - Worldwide", "Engineer", False, "remote"),
        ("Not specified", "Engineer", True, "remote"),
        ("Paris", "Engineer", False, "onsite"),
        (None, "Engineer", None, None),
    ],
)
def test_workplace_type(location, title, remote, expected):
    assert d.workplace_type(location, title, remote) == expected


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("VP of Engineering", "executive"),
        ("Chief Technology Officer", "executive"),
        ("Director, Data", "director"),
        ("Head of Design", "director"),
        ("Software Engineering Intern", "internship"),
        ("Junior Developer", "entry"),
        ("Sr. Backend Engineer", "mid_senior"),
        ("Staff Engineer", "mid_senior"),
        ("Associate Product Manager", "mid_senior"),  # "manager" wins over associate
        ("Associate Consultant", "associate"),
        ("Backend Engineer", None),  # no level stated: unknown, never guessed
    ],
)
def test_seniority_from_title(title, expected):
    assert d.seniority(None, title) == expected


def test_seniority_structured_wins():
    assert d.seniority("junior", "Senior Engineer") == "entry"


@pytest.mark.parametrize(
    ("job_type", "title", "expected"),
    [
        ("contract", "Full-time Engineer", "contract"),
        (None, "Part-time Bookkeeper", "part-time"),
        (None, "Volunteer Mentor", "volunteer"),
        (None, "Freelance Designer", "freelance"),
        (None, "Temporary Data Entry", "temporary"),
        (None, "Summer Internship", "internship"),
        (None, "Engineer", None),
    ],
)
def test_employment_type(job_type, title, expected):
    assert d.employment_type(job_type, title) == expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Salary: $120,000 - $150,000 per year", (120000, 150000, "USD", "year")),
        ("Pay €60k–75k annually", (60000, 75000, "EUR", "year")),
        ("£45/hour, flexible", (45, 45, "GBP", "hour")),
        ("USD 8,000 - 10,000 per month", (8000, 10000, "USD", "month")),
        ("We match your 401k and give $500 learning budget", None),
        ("$5 coffee stipend", None),
        ("Compensation $100,000 - $900,000", None),  # implausible range
    ],
)
def test_salary_from_text(text, expected):
    assert d.salary_from_text(text) == expected


@pytest.mark.parametrize(
    ("location", "expected"),
    [
        ("Berlin, Germany", ("DE", "europe")),
        ("Austin, TX", ("US", "north_america")),
        ("Remote - USA", ("US", "north_america")),
        ("London", ("GB", "europe")),
        ("Germany / France", (None, "europe")),
        ("USA or Germany", (None, None)),
        ("Remote (Worldwide)", (None, "worldwide")),
        ("LATAM", (None, "latam")),
        ("Not specified", (None, None)),
    ],
)
def test_country_region(location, expected):
    assert d.country_region(location) == expected


def test_timezone_band():
    assert d.timezone_band("Overlap with UTC-5 to UTC+1 required", None, None) == (-5, 1)
    assert d.timezone_band("Core hours in EST", None, None) == (-5, -5)
    assert d.timezone_band("nothing here", "DE", "europe") == (1, 1)
    assert d.timezone_band("nothing here", None, "worldwide") == (None, None)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Visa sponsorship is available for this role.", True),
        ("We are unable to sponsor visas.", False),
        ("Candidates must be authorized to work in the US.", False),
        ("No visa sponsorship.", False),
        ("Great team and benefits.", None),
    ],
)
def test_visa(text, expected):
    assert d.visa_sponsorship(text) is expected


def test_language_and_function_and_industry():
    de = "Wir suchen eine Entwicklerin für unser Team. Sie arbeiten mit uns an der Plattform und bei unseren Kunden."
    assert d.language("Entwickler", de) == "de"
    en = "You will work with our team and the product. We are hiring for this role and you will have fun."
    assert d.language("Engineer", en) == "en"
    assert d.language("Engineer", "Short") is None
    assert d.job_function("Senior Data Engineer") == "data"
    assert d.job_function("Frontend Developer") == "engineering"
    assert d.job_function("Account Executive") == "sales"
    assert d.job_function("Wizard") is None
    assert d.industry("USAJOBS", "", "") == "government"
    assert d.industry(None, "PayCo", "A fintech for payments and banking") == "finance"
    assert d.industry(None, "Acme", "We build things") is None


def test_prepare_for_storage_derives_and_keeps_stated_values():
    job = JobPostCreate(
        title="Senior Backend Engineer (Contract)",
        description="Pay $90/hour. Visa sponsorship is available. You will work with our team on the platform.",
        company_name="Acme",
        location="Berlin, Germany (Hybrid)",
        external_id="t_1",
        source="TEST",
        workplace_type="remote",  # stated by the source: wins over "Hybrid" in text
    )
    (out,) = prepare_for_storage([job])
    assert out.workplace_type == "remote"
    assert out.seniority == "mid_senior"
    assert out.job_type == "contract"
    assert (out.salary_min, out.salary_max, out.salary_period, out.currency) == (90, 90, "hour", "USD")
    assert (out.country_code, out.region, out.tz_min, out.tz_max) == ("DE", "europe", 1, 1)
    assert out.visa_sponsorship is True
    assert out.job_function == "engineering"
    assert out.language == "en"


def test_structured_salary_not_overwritten():
    job = JobPostCreate(
        title="Engineer",
        description="$1,000,000 - $2,000,000 per year",
        company_name="Acme",
        salary_min=50000,
        salary_max=60000,
        salary_period="year",
        currency="EUR",
    )
    (out,) = prepare_for_storage([job])
    assert (out.salary_min, out.salary_max, out.currency) == (50000, 60000, "EUR")


# ── API ─────────────────────────────────────────────────────────────────────


async def _seed() -> None:
    from conftest import TestingSessionLocal

    from app.domains.jobs.models import JobPost

    now = datetime.now(UTC)
    rows = [
        dict(title="Senior Python Engineer", company_name="Acme", workplace_type="remote",  # noqa: C408
             seniority="mid_senior", job_type="full-time", country_code="DE", region="europe",
             tz_min=1, tz_max=1, industry="finance", job_function="engineering", language="en",
             visa_sponsorship=True, salary_min=90000, salary_max=120000, salary_period="year",
             currency="EUR", skills=["Python", "AWS"], source="REMOTEOK", posted_at=now - timedelta(hours=2),
             description="Build data pipelines for payments"),
        dict(title="Junior React Developer", company_name="Beta", workplace_type="hybrid",  # noqa: C408
             seniority="entry", job_type="contract", country_code="US", region="north_america",
             tz_min=-8, tz_max=-5, job_function="engineering", language="en", is_remote=False,
             skills=["React"], source="DIRECT", posted_at=now - timedelta(days=5),
             description="Frontend work on design systems"),
        dict(title="Marketing Director", company_name="Gamma", workplace_type="onsite",  # noqa: C408
             seniority="director", job_type="full-time", country_code="GB", region="europe",
             job_function="marketing", language="en", is_remote=False, skills=[],
             source="ARBEITNOW", posted_at=now - timedelta(days=60),
             salary_min=100000, salary_max=130000, salary_period="year", currency="GBP",
             description="Lead brand and growth"),
    ]  # fmt: skip
    async with TestingSessionLocal() as db:
        for i, r in enumerate(rows):
            db.add(JobPost(slug=f"job-{i}-{uuid.uuid4().hex[:6]}", **r))
        await db.commit()


async def _titles(client: AsyncClient, params) -> list[str]:
    res = await client.get("/api/v1/jobs", params=params)
    assert res.status_code == 200, res.text
    assert int(res.headers["x-total-count"]) == len(res.json())
    return sorted(j["title"] for j in res.json())


@pytest.mark.asyncio
async def test_filters(client: AsyncClient):
    await _seed()
    py, react, mkt = "Senior Python Engineer", "Junior React Developer", "Marketing Director"
    # Default stays remote-only (back-compatible); a workplace choice replaces it.
    assert await _titles(client, {}) == [py]
    assert await _titles(client, {"workplace": ["hybrid", "onsite"]}) == [react, mkt]
    assert await _titles(client, [("workplace", "remote"), ("workplace", "hybrid"),
                                  ("workplace", "onsite"), ("seniority", "director")]) == [mkt]  # fmt: skip
    every = [("workplace", w) for w in ("remote", "hybrid", "onsite")]
    assert await _titles(client, every + [("job_type", "contract")]) == [react]
    assert await _titles(client, every + [("posted_within", "24h")]) == [py]
    assert await _titles(client, every + [("posted_within", "7d")]) == [react, py]
    assert await _titles(client, every + [("country", "gb")]) == [mkt]
    assert await _titles(client, every + [("region", "europe")]) == [mkt, py]
    assert await _titles(client, every + [("company", "acme"), ("company", "Beta")]) == [react, py]
    assert await _titles(client, every + [("industry", "finance")]) == [py]
    assert await _titles(client, every + [("job_function", "marketing")]) == [mkt]
    assert await _titles(client, every + [("skills", "react")]) == [react]
    assert await _titles(client, every + [("apply", "platform")]) == [react]
    assert await _titles(client, every + [("apply", "external")]) == [mkt, py]
    assert await _titles(client, every + [("visa_sponsorship", "true")]) == [py]
    assert await _titles(client, every + [("language", "en")]) == sorted([react, mkt, py])
    assert await _titles(client, every + [("has_salary", "true")]) == [mkt, py]
    assert await _titles(client, every + [("tz", "-6")]) == [react]
    assert await _titles(client, every + [("source", "arbeitnow"), ("source", "remoteok")]) == [mkt, py]
    assert await _titles(client, every + [("query", '"data pipelines"')]) == [py]
    assert await _titles(client, every + [("query", '"pipelines data"')]) == []
    assert await _titles(
        client,
        every + [("min_salary", "95000"), ("salary_currency", "EUR"), ("salary_period", "year")],
    ) == [py]
    assert await _titles(client, every + [("verified", "true")]) == []
    # Sort by salary: highest stated salary first, unknown last.
    res = await client.get("/api/v1/jobs", params=every + [("sort", "salary")])
    assert [j["title"] for j in res.json()] == [mkt, py, react]
    # Responses carry the derived fields.
    job = next(j for j in res.json() if j["title"] == py)
    assert job["workplace_type"] == "remote"
    assert job["country_code"] == "DE"


@pytest.mark.asyncio
async def test_invalid_filter_values_rejected(client: AsyncClient):
    for params in (
        {"workplace": "moon"},
        {"seniority": "guru"},
        {"posted_within": "2d"},
        {"sort": "random"},
        {"apply": "fax"},
        {"tz": "20"},
        {"min_salary": "10"},
    ):
        assert (await client.get("/api/v1/jobs", params=params)).status_code == 422, params


@pytest.mark.asyncio
async def test_facets_exclude_their_own_filter(client: AsyncClient):
    await _seed()
    res = await client.get("/api/v1/jobs/facets", params=[("workplace", "remote")])
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 1
    workplace = {f["value"]: f["count"] for f in body["facets"]["workplace"]}
    assert workplace == {"remote": 1, "hybrid": 1, "onsite": 1}
    seniority = {f["value"]: f["count"] for f in body["facets"]["seniority"]}
    assert seniority == {"mid_senior": 1}
    posted = {f["value"]: f["count"] for f in body["facets"]["posted_within"]}
    assert posted["24h"] == 1
    assert posted["90d"] == 1
    assert {"value": "Python", "count": 1} in body["facets"]["skills"]
    assert body["facets"]["apply"] == [
        {"value": "platform", "count": 0},
        {"value": "external", "count": 1},
    ]


# ── saved searches + alerts ─────────────────────────────────────────────────


async def _signup(client: AsyncClient, email: str) -> dict[str, str]:
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "x", "full_name": "P", "role": "ENGINEER"},
    )
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.mark.asyncio
async def test_saved_search_crud_and_alert(client: AsyncClient):
    from conftest import TestingSessionLocal
    from sqlalchemy import select

    from app.domains.jobs.models import JobPost, SavedJobSearch
    from app.domains.jobs.saved_searches import send_job_alerts
    from app.domains.notifications.models import Notification

    me = await _signup(client, "saved@example.com")
    assert (await client.get("/api/v1/jobs/saved-searches")).status_code in (401, 403)
    bad = await client.post(
        "/api/v1/jobs/saved-searches", headers=me, json={"name": "x", "params": {"tz": "nope"}}
    )
    assert bad.status_code == 422
    res = await client.post(
        "/api/v1/jobs/saved-searches",
        headers=me,
        json={"name": "Remote Python", "params": {"skills": ["Python"], "workplace": ["remote"], "junk": 1}},
    )
    assert res.status_code == 201, res.text
    saved = res.json()
    assert "junk" not in saved["params"]
    assert saved["params"]["skills"] == ["Python"]
    listed = (await client.get("/api/v1/jobs/saved-searches", headers=me)).json()
    assert [s["id"] for s in listed] == [saved["id"]]
    other = await _signup(client, "other@example.com")
    assert (
        await client.delete(f"/api/v1/jobs/saved-searches/{saved['id']}", headers=other)
    ).status_code == 404
    patched = await client.patch(
        f"/api/v1/jobs/saved-searches/{saved['id']}", headers=me, json={"frequency": "weekly"}
    )
    assert patched.json()["frequency"] == "weekly"

    # A new matching job after saving -> one alert once the period has passed.
    now = datetime.now(UTC)
    async with TestingSessionLocal() as db:
        row = await db.get(SavedJobSearch, uuid.UUID(saved["id"]))
        row.last_notified_at = now - timedelta(days=8)
        db.add(JobPost(slug="alert-job", title="Python Dev", company_name="Acme", description="x",
                       workplace_type="remote", skills=["Python"], posted_at=now - timedelta(days=1)))  # fmt: skip
        db.add(JobPost(slug="old-job", title="Python Old", company_name="Acme", description="x",
                       workplace_type="remote", skills=["Python"], posted_at=now - timedelta(days=9)))  # fmt: skip
        await db.commit()
    async with TestingSessionLocal() as db:
        assert await send_job_alerts(db, now=now) == {"checked": 1, "sent": 1}
    async with TestingSessionLocal() as db:
        notes = (await db.scalars(select(Notification).where(Notification.kind == "job_alert"))).all()
        assert len(notes) == 1
        assert "1 new job" in notes[0].title
        # Not due again until the next period.
        assert await send_job_alerts(db, now=now + timedelta(hours=1)) == {"checked": 0, "sent": 0}
    assert (
        await client.delete(f"/api/v1/jobs/saved-searches/{saved['id']}", headers=me)
    ).status_code == 204


def test_search_link():
    from app.domains.jobs.saved_searches import search_link

    link = search_link({"workplace": ["remote", "hybrid"], "has_salary": True, "is_remote": True})
    assert link == "#jobs?workplace=remote&workplace=hybrid&has_salary=true"


@pytest.mark.asyncio
async def test_backfill_derives_in_batches():
    from conftest import TestingSessionLocal

    from app.domains.jobs.backfill import backfill_filters
    from app.domains.jobs.models import JobPost

    async with TestingSessionLocal() as db:
        for i in range(5):
            db.add(JobPost(slug=f"bf-{i}", title=f"Junior Designer {i}", company_name="Acme",
                           description="Salary $60,000 - $70,000 per year", location="Toronto, Canada",
                           is_remote=False, posted_at=datetime.now(UTC)))  # fmt: skip
        await db.commit()
    async with TestingSessionLocal() as db:
        first = await backfill_filters(db, batch_size=2, max_batches=1)
        assert first == {"updated": 2, "complete": False}
        rest = await backfill_filters(db, batch_size=2, max_batches=10)
        assert rest["complete"] is True
        assert rest["updated"] == 3
    async with TestingSessionLocal() as db:
        from sqlalchemy import select

        job = (await db.scalars(select(JobPost).where(JobPost.slug == "bf-0"))).one()
        assert (job.seniority, job.country_code, job.workplace_type) == ("entry", "CA", "onsite")
        assert (job.salary_min, job.salary_period, job.job_function) == (60000, "year", "design")
        assert job.derived_version == d.DERIVE_VERSION
