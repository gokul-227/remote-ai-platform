"""SEO ranking work: richer landing aggregates, the Indexing API catch-up sweep and
the weekly Search Console summary to Slack. No network."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

import app.services.search.indexing as ix
from app.core.config import settings
from app.domains.jobs.repository import salary_by_seniority, top_skills, weekly_counts
from app.worker import ops


def test_salary_by_seniority_uses_main_currency_and_needs_three_each():
    rows = [
        (100, 120, "USD", "year", "senior"),
        (110, 130, "USD", "year", "senior"),
        (120, 140, "usd", "year", "senior"),
        (60, 70, "USD", "year", "junior"),
        (65, 75, "USD", "year", "junior"),
        (70, 80, "USD", "year", "junior"),
        (90, 90, "USD", "year", "mid"),  # only one: left out
        (50, 60, "EUR", "year", "senior"),  # other currency: left out
        (40, 50, "USD", "year", None),
    ]
    out = salary_by_seniority(rows)
    assert [r["seniority"] for r in out] == ["junior", "senior"]
    assert out[1]["currency"] == "USD"
    assert out[1]["count"] == 3
    assert out[1]["median"] == 120
    assert salary_by_seniority([]) == []


def test_top_skills_counts_each_job_once_and_drops_singletons():
    out = top_skills([["Python", "Python", "SQL"], ["python", "SQL"], ["Python"], ["Rust"]])
    assert out[0] == {"name": "Python", "count": 2}
    assert {"name": "SQL", "count": 2} in out
    assert all(s["name"] != "Rust" for s in out)


def test_weekly_counts_oldest_first():
    now = datetime.now(UTC)
    dates = [now, now - timedelta(days=1), now - timedelta(days=8), now - timedelta(days=40), None]
    assert weekly_counts(dates) == [0, 0, 1, 2]
    naive = (now - timedelta(days=15)).replace(tzinfo=None)
    assert weekly_counts([naive]) == [0, 1, 0, 0]


@pytest.mark.asyncio
async def test_landing_stats_endpoint_returns_new_fields(client):
    r = await client.get("/api/v1/jobs/landing-stats", params={"query": "zz-no-such-thing"})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0
    assert body["salary_by_seniority"] == []
    assert body["top_skills"] == []
    assert body["weekly_new"] == [0, 0, 0, 0]


@pytest.mark.asyncio
async def test_sweep_sends_only_unannounced_indexable_jobs(monkeypatch):
    a, b = uuid.uuid4(), uuid.uuid4()
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "APP_URL", "https://remoteaiplatform.com")

    class Result:
        def scalars(self):
            return [a, b]

    class DB:
        async def execute(self, _stmt):
            return Result()

    async def indexable(self, ids):
        return list(ids)

    monkeypatch.setattr("app.domains.jobs.repository.JobRepository.indexable_newest_first", indexable)

    async def announced(urls):
        return {u for u in urls if str(a) in u}

    sent: dict[str, Any] = {}

    async def notify(ids, removed=None, *, indexnow=True):
        sent["ids"], sent["indexnow"] = ids, indexnow
        return {"google": len(ids), "google_deleted": 0, "indexnow": 0}

    monkeypatch.setattr(ix, "_already_announced", announced)
    monkeypatch.setattr(ix, "notify_jobs", notify)
    out = await ix.sweep_unannounced(DB())
    assert sent == {"ids": [b], "indexnow": False}
    assert out == {"candidates": 1, "google": 1}


@pytest.mark.asyncio
async def test_sweep_is_off_outside_production(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "test")
    assert await ix.sweep_unannounced(object()) == {"candidates": 0, "google": 0}


@pytest.mark.asyncio
async def test_already_announced_without_redis_sends_nothing_extra(monkeypatch):
    monkeypatch.setattr(settings, "REDIS_URL", "redis://127.0.0.1:1/0", raising=False)
    urls = ["https://x/jobs/1"]
    assert await ix._already_announced(urls) == set(urls)
    await ix._mark_announced(urls)  # never raises


@pytest.mark.asyncio
async def test_weekly_report_disabled_by_default():
    assert await ops.seo_weekly_report() == {"skipped": "disabled"}


@pytest.mark.asyncio
async def test_weekly_report_posts_summary(monkeypatch):
    monkeypatch.setattr(settings, "SEO_WEEKLY_REPORT_ENABLED", True)
    calls: list[int] = []

    async def report(days=28, offset_days=0):
        calls.append(offset_days)
        clicks = 120 if offset_days == 3 else 100
        return {
            "configured": True,
            "clicks": clicks,
            "impressions": 4000,
            "average_position": 18.2,
            "top_queries": [{"key": "remote python jobs", "clicks": 9, "impressions": 300, "position": 7.1}],
            "top_pages": [],
            "sitemaps": [{"path": "s", "submitted": 10, "indexed": 4, "errors": 0, "last_read": None}],
        }

    posted: list[tuple] = []

    async def post(channel, text, **kw):
        posted.append((channel, text, kw))
        return True

    monkeypatch.setattr(ix, "search_console_report", report)
    monkeypatch.setattr(ops.slack, "post", post)
    out = await ops.seo_weekly_report()
    assert calls == [3, 10]
    assert out["clicks"] == 120
    assert out["submitted"] == 10
    channel, text, kw = posted[0]
    assert channel == "signups"  # no #seo channel configured
    assert "120 clicks (+20% vs previous 7 days)" in text
    assert "remote python jobs" in kw["fields"]["top queries"]


@pytest.mark.asyncio
async def test_weekly_report_unconfigured_and_failure(monkeypatch):
    monkeypatch.setattr(settings, "SEO_WEEKLY_REPORT_ENABLED", True)

    async def none(days=28, offset_days=0):
        return {"configured": False}

    monkeypatch.setattr(ix, "search_console_report", none)
    assert await ops.seo_weekly_report() == {"skipped": "no credentials"}

    async def boom(days=28, offset_days=0):
        raise RuntimeError("403")

    posted: list[str] = []

    async def post(channel, text, **kw):
        posted.append(text)
        return True

    monkeypatch.setattr(ix, "search_console_report", boom)
    monkeypatch.setattr(ops.slack, "post", post)
    assert await ops.seo_weekly_report() == {"error": "RuntimeError"}
    assert "failed" in posted[0]
