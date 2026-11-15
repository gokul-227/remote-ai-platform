"""External reading: parsers (fixtures, no network), dedup, retention, robots,
scheduling through job_sources, the public endpoint and staff removal."""

import json
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from auth_support import token_for
from conftest import TestingSessionLocal
from httpx import AsyncClient
from sqlalchemy import select

from app.domains.auth.models import User, UserRole
from app.domains.social import news
from app.domains.social.models import NewsItem
from app.domains.tasks.models import JobImportCheckpoint, JobSource, TaskRun
from app.domains.tasks.service import TaskService

FIX = Path(__file__).parent / "fixtures" / "news"


def _resp(url: str, status: int = 200, body: bytes | str = b"", ctype: str = "application/json"):
    content = body.encode() if isinstance(body, str) else body
    return httpx.Response(status, content=content, headers={"content-type": ctype}, request=httpx.Request("GET", url))


def fake_fetch(routes: dict[str, tuple[int, bytes | str]]):
    calls: list[str] = []

    async def fetch(url: str) -> httpx.Response:
        calls.append(url)
        for prefix, (status, body) in routes.items():
            if url.startswith(prefix):
                return _resp(url, status, body)
        return _resp(url, 404, "")

    fetch.calls = calls  # type: ignore[attr-defined]
    return fetch


def test_canonical_url_strips_tracking_and_rejects_non_web():
    assert news.canonical_url("https://Example.org/a/?utm_source=x&id=2#frag") == "https://example.org/a?id=2"
    assert news.canonical_url("javascript:alert(1)") is None
    assert news.canonical_url("ftp://x.org/a") is None


def test_parse_devto_keeps_only_title_excerpt_link():
    items = news.parse_devto(json.loads((FIX / "devto.json").read_text()))
    assert len(items) == 1
    item = items[0]
    assert item.title == "Async standups that work"
    assert item.url == "https://example.org/blog/async-standups"
    assert item.excerpt == "How a distributed team replaced its daily call."
    assert item.discussion_url == "https://dev.to/someone/async-standups-1a2b"
    assert "FULL TEXT" not in json.dumps(item.__dict__, default=str)
    assert item.tags == ["remote", "productivity"]


def test_parse_hn_never_copies_member_text():
    items = news.parse_hn(json.loads((FIX / "hn.json").read_text()))
    assert [i.title for i in items] == ["Remote work is here to stay", "Ask HN: How do you run remote onboarding?"]
    assert all(i.excerpt is None for i in items)
    assert items[1].url == "https://news.ycombinator.com/item?id=4002"
    assert items[1].discussion_url is None


def test_parse_feed_atom_and_rss_without_entities():
    atom = news.parse_feed((FIX / "feed.atom").read_bytes())
    assert len(atom) == 1
    assert atom[0].url == "https://blog.example.com/handbook-first"
    assert "root:" not in (atom[0].excerpt or "")
    assert atom[0].tags == ["remote"]
    rss = news.parse_feed((FIX / "feed.rss").read_bytes())
    assert rss[0].excerpt == "A short summary."
    assert rss[0].published_at == datetime(2026, 11, 11, 8, tzinfo=UTC)
    assert news.parse_feed(b"not xml") == []


def test_excerpt_is_short():
    text = "word " * 200
    out = news.plain_excerpt(text)
    assert out is not None
    assert len(out) <= news.EXCERPT_MAX


@pytest.mark.asyncio
async def test_robots_rules():
    assert await news.robots_allows("https://a.org/feed", fake_fetch({}))  # 404 robots
    deny = fake_fetch({"https://a.org/robots.txt": (200, "User-agent: *\nDisallow: /feed")})
    assert not await news.robots_allows("https://a.org/feed", deny)
    down = fake_fetch({"https://a.org/robots.txt": (503, "")})
    assert not await news.robots_allows("https://a.org/feed", down)


@pytest.mark.asyncio
async def test_import_dedups_across_sources_and_prunes():
    devto = (FIX / "devto.json").read_text()
    hn = (FIX / "hn.json").read_text()
    fetch = fake_fetch({"https://dev.to/api": (200, devto), "https://hn.algolia.com/api": (200, hn)})
    async with TestingSessionLocal() as db:
        first = await news.import_news(db, "NEWS_DEVTO", fetch)
        assert first["saved"] == 1
        again = await news.import_news(db, "NEWS_DEVTO", fetch)
        assert again["saved"] == 0
        # HN links to the same article (different case, trailing slash): deduplicated.
        hn_stats = await news.import_news(db, "NEWS_HN", fetch)
        assert hn_stats["saved"] == 1
        rows = (await db.execute(select(NewsItem))).scalars().all()
        assert len(rows) == 2
        old = rows[0]
        old.fetched_at = datetime.now(UTC) - timedelta(days=31)
        await db.commit()
        assert await news.prune(db) == 1
        assert await news.purge_source(db, "NEWS_HN") >= 0
    with pytest.raises(ValueError, match="unknown news source"):
        async with TestingSessionLocal() as db:
            await news.import_news(db, "NEWS_UNKNOWN", fetch)


@pytest.mark.asyncio
async def test_robots_block_raises():
    fetch = fake_fetch({"https://dev.to/robots.txt": (200, "User-agent: *\nDisallow: /")})
    async with TestingSessionLocal() as db:
        with pytest.raises(PermissionError):
            await news.import_news(db, "NEWS_DEVTO", fetch)


@pytest.mark.asyncio
async def test_scheduling_registers_news_sources_and_feeds_wait_for_staff():
    sent: list[tuple[str, dict]] = []
    async with TestingSessionLocal() as db:
        service = TaskService(db, dispatcher=lambda n, r, a, e: sent.append((n, a)))
        await service.ensure_news_sources()
        await service.ensure_news_sources()  # idempotent
        gitlab = await db.get(JobSource, "NEWS_RSS_GITLAB")
        assert gitlab is not None
        assert gitlab.permission_confirmed is False
        runs = await service.due_sources(datetime.now(UTC))
    names = {r.args["source"] for r in runs if r.task_name == "news.import_source"}
    assert names == {"NEWS_DEVTO", "NEWS_HN"}
    assert all(n == "news.import_source" for n, a in sent if a["source"].startswith("NEWS_"))


@pytest.mark.asyncio
async def test_worker_task_records_checkpoint(monkeypatch):
    from app.worker import runtime, tasks

    monkeypatch.setattr(runtime, "session_factory", lambda: TestingSessionLocal)
    fetch = fake_fetch({"https://dev.to/api": (200, (FIX / "devto.json").read_text())})
    async with TestingSessionLocal() as db:
        run, _ = await TaskService(db, dispatcher=lambda *a: None).enqueue(
            "news.import_source", {"source": "NEWS_DEVTO"}
        )
    result = await tasks.import_news_async(run.id, "NEWS_DEVTO", fetch)
    assert result["saved"] == 1
    async with TestingSessionLocal() as db:
        cp = await db.get(JobImportCheckpoint, "NEWS_DEVTO")
        assert cp is not None
        assert cp.consecutive_failures == 0
        assert (await db.get(TaskRun, run.id)).status == "SUCCEEDED"  # type: ignore[union-attr]
        run2, _ = await TaskService(db, dispatcher=lambda *a: None).enqueue(
            "news.import_source", {"source": "NEWS_DEVTO", "n": 2}
        )
    failing = fake_fetch({"https://dev.to/robots.txt": (503, "")})
    out = await tasks.import_news_async(run2.id, "NEWS_DEVTO", failing)
    assert "error" in out
    async with TestingSessionLocal() as db:
        cp = await db.get(JobImportCheckpoint, "NEWS_DEVTO")
        assert cp is not None
        assert cp.consecutive_failures == 1


async def _seed(source: str = "NEWS_DEVTO", confirmed: bool = True) -> uuid.UUID:
    async with TestingSessionLocal() as db:
        db.add(JobSource(name=source, permission_confirmed=confirmed, enabled=True))
        item = NewsItem(
            source=source,
            url="https://example.org/a",
            url_hash=news.url_hash("https://example.org/a"),
            title="An article",
            excerpt="Short",
            tags=["remote"],
            published_at=datetime.now(UTC),
            fetched_at=datetime.now(UTC),
        )
        db.add(item)
        await db.commit()
        return item.id


@pytest.mark.asyncio
async def test_public_endpoint_is_attributed_and_noindex(client: AsyncClient):
    await _seed()
    resp = await client.get("/api/v1/social/external")
    assert resp.status_code == 200
    assert "noindex" in resp.headers["x-robots-tag"]
    body = resp.json()
    assert body["external"] is True
    item = body["items"][0]
    assert item["source"]["label"] == "DEV Community"
    assert item["url"] == "https://example.org/a"
    assert "author" not in item


@pytest.mark.asyncio
async def test_unconfirmed_source_is_hidden(client: AsyncClient):
    await _seed("NEWS_RSS_GITLAB", confirmed=False)
    body = (await client.get("/api/v1/social/external")).json()
    assert body["items"] == []
    assert body["total"] == 0
    body = (await client.get("/api/v1/social/external", params={"source": "news_rss_gitlab"})).json()
    assert body["items"] == []


@pytest.mark.asyncio
async def test_staff_can_remove_items_members_cannot(client: AsyncClient):
    item_id = await _seed()
    async with TestingSessionLocal() as db:
        member = User(id=uuid.uuid4(), auth_subject=str(uuid.uuid4()), email="m@x.org", full_name="M", role=UserRole.ENGINEER)
        admin = User(id=uuid.uuid4(), auth_subject=str(uuid.uuid4()), email="a@x.org", full_name="A", role=UserRole.ADMIN)
        db.add_all([member, admin])
        await db.commit()
    url = f"/api/v1/social/external/{item_id}"
    assert (await client.delete(url, headers={"Authorization": f"Bearer {token_for(member)}"})).status_code == 403
    assert (await client.delete(url, headers={"Authorization": f"Bearer {token_for(admin)}"})).status_code == 204
    assert (await client.get("/api/v1/social/external")).json()["items"] == []


@pytest.mark.asyncio
async def test_withdrawing_permission_purges_items(client: AsyncClient):
    await _seed()
    async with TestingSessionLocal() as db:
        admin = User(id=uuid.uuid4(), auth_subject=str(uuid.uuid4()), email="s@x.org", full_name="S", role=UserRole.ADMIN)
        db.add(admin)
        await db.commit()
    resp = await client.patch(
        "/api/v1/admin/background/sources/NEWS_DEVTO",
        json={"permission_confirmed": False, "reason": "terms changed"},
        headers={"Authorization": f"Bearer {token_for(admin)}"},
    )
    assert resp.status_code == 200, resp.text
    async with TestingSessionLocal() as db:
        assert (await db.execute(select(NewsItem))).scalars().all() == []
