"""
External reading ("From around the web"): public, attributed links from
sources whose terms allow it. These are never member posts: they have no
author, no reactions and no comments, and every item links to the original.

What is stored, per item, and nothing else: title, a short excerpt (only where
the source publishes one for syndication), the original link, an optional
discussion link, the source, published_at and tags. Full text is never stored.
Items are deduplicated by canonical URL and deleted after
NEWS_RETENTION_DAYS.

Scheduling reuses the job import machinery: each source is a `job_sources`
row named `NEWS_*` (so staff can pause it, change its cron or withdraw
permission from the console) and records its progress in
`job_import_checkpoints`. Sources whose terms need a human check start with
`permission_confirmed = False` and never run until staff confirm them.

Research and terms: internal doc transformation/07-community-content.md.
"""

import hashlib
import html
import re
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

import httpx
from lxml import etree
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.domains.social.models import NewsItem

logger = get_logger(__name__)

USER_AGENT = "RemoteAIPlatform-Reader/1.0 (+https://remoteaiplatform.com)"
NEWS_PREFIX = "NEWS_"
TASK_IMPORT_NEWS = "news.import_source"
RETENTION_DAYS = 30
EXCERPT_MAX = 280
TITLE_MAX = 300
MAX_ITEMS_PER_RUN = 50
MAX_BODY_BYTES = 2_000_000

_TRACKING = re.compile(r"^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$)")


@dataclass(frozen=True)
class NewsSource:
    name: str  # job_sources.name, always NEWS_*
    label: str  # shown to users as the attribution
    homepage: str
    kind: str  # devto | hn | feed
    url: str
    # True only where the source's terms clearly allow headline + link reuse.
    # Feeds default to False: staff confirm each one in the console.
    permission_default: bool
    cron: str = "40 */6 * * *"
    # Whether our public pages may let search engines index these items.
    # No source grants it today, so the endpoint always sends noindex.
    indexable: bool = False


NEWS_SOURCES: tuple[NewsSource, ...] = (
    NewsSource(
        name="NEWS_DEVTO",
        label="DEV Community",
        homepage="https://dev.to",
        kind="devto",
        url="https://dev.to/api/articles?tag=remote&per_page=30",
        permission_default=True,
    ),
    NewsSource(
        name="NEWS_HN",
        label="Hacker News",
        homepage="https://news.ycombinator.com",
        kind="hn",
        url="https://hn.algolia.com/api/v1/search_by_date?tags=story&query=remote%20work&hitsPerPage=30",
        permission_default=True,
    ),
    NewsSource(
        name="NEWS_RSS_GITLAB",
        label="GitLab Blog",
        homepage="https://about.gitlab.com/blog/",
        kind="feed",
        url="https://about.gitlab.com/atom.xml",
        permission_default=False,
        cron="50 */12 * * *",
    ),
)
SOURCES_BY_NAME = {s.name: s for s in NEWS_SOURCES}


# ── normalisation ────────────────────────────────────────────────────────────


def canonical_url(url: str) -> str | None:
    """http(s) only; lower-cased host, no fragment, no tracking parameters,
    no trailing slash. Returns None for anything that is not a web link."""
    try:
        parts = urlsplit(url.strip())
    except ValueError:
        return None
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        return None
    query = urlencode(
        [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if not _TRACKING.match(k)]
    )
    host = parts.hostname.lower()
    netloc = host if parts.port is None else f"{host}:{parts.port}"
    path = parts.path.rstrip("/") or ""
    return urlunsplit(("https" if parts.scheme == "https" else "http", netloc, path, query, ""))


def url_hash(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()


_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def plain_excerpt(text: str | None, limit: int = EXCERPT_MAX) -> str | None:
    """Strip markup and cut to a short excerpt (a summary, never the article)."""
    if not text:
        return None
    clean = _WS_RE.sub(" ", html.unescape(_TAG_RE.sub(" ", text))).strip()
    if not clean:
        return None
    return clean if len(clean) <= limit else clean[: limit - 1].rsplit(" ", 1)[0] + "…"


def _parse_date(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, int | float):
        return datetime.fromtimestamp(value, UTC)
    text = str(value).strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = parsedate_to_datetime(text)
        except (TypeError, ValueError):
            return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


@dataclass
class ParsedItem:
    title: str
    url: str
    excerpt: str | None
    published_at: datetime | None
    tags: list[str]
    discussion_url: str | None = None


def _item(
    title: Any, url: Any, excerpt: Any, published: Any, tags: Any, discussion: Any = None
) -> ParsedItem | None:
    title_text = plain_excerpt(str(title or ""), TITLE_MAX)
    link = canonical_url(str(url or ""))
    if not title_text or not link:
        return None
    clean_tags = [str(t).strip().lower()[:40] for t in (tags or []) if str(t).strip()][:8]
    disc = canonical_url(str(discussion)) if discussion else None
    return ParsedItem(
        title=title_text,
        url=link,
        excerpt=plain_excerpt(str(excerpt)) if excerpt else None,
        published_at=_parse_date(published),
        tags=clean_tags,
        discussion_url=disc if disc != link else None,
    )


# ── parsers (pure; tested with fixtures) ─────────────────────────────────────


def parse_devto(payload: Any) -> list[ParsedItem]:
    """DEV (Forem) /api/articles. `description` is the author's own summary,
    published for listing cards; the article body is never requested."""
    out: list[ParsedItem] = []
    for row in payload if isinstance(payload, list) else []:
        if not isinstance(row, dict):
            continue
        tags = row.get("tag_list") or []
        if isinstance(tags, str):
            tags = list(tags.split(","))
        item = _item(
            row.get("title"),
            row.get("canonical_url") or row.get("url"),
            row.get("description"),
            row.get("published_at"),
            tags,
            row.get("url"),
        )
        if item:
            out.append(item)
    return out


def parse_hn(payload: Any) -> list[ParsedItem]:
    """HN Search (Algolia). Title + link only: `story_text` is a member's own
    writing and is not copied. Ask HN posts link to the discussion."""
    out: list[ParsedItem] = []
    hits = payload.get("hits", []) if isinstance(payload, dict) else []
    for hit in hits:
        if not isinstance(hit, dict) or not hit.get("objectID"):
            continue
        discussion = f"https://news.ycombinator.com/item?id={hit['objectID']}"
        item = _item(
            hit.get("title"),
            hit.get("url") or discussion,
            None,
            hit.get("created_at_i") or hit.get("created_at"),
            [],
            discussion,
        )
        if item:
            out.append(item)
    return out


_ATOM = "{http://www.w3.org/2005/Atom}"


def parse_feed(body: bytes) -> list[ParsedItem]:
    """RSS 2.0 or Atom. Entities and network access are disabled in the parser."""
    parser = etree.XMLParser(
        resolve_entities=False, no_network=True, huge_tree=False, recover=True, load_dtd=False
    )
    try:
        root = etree.fromstring(body, parser=parser)
    except etree.XMLSyntaxError:
        return []
    if root is None:
        return []
    out: list[ParsedItem] = []
    for node in root.iter("item"):  # RSS
        item = _item(
            node.findtext("title"),
            node.findtext("link"),
            node.findtext("description"),
            node.findtext("pubDate"),
            [c.text for c in node.findall("category") if c.text],
        )
        if item:
            out.append(item)
    for node in root.iter(f"{_ATOM}entry"):  # Atom
        link = None
        for el in node.findall(f"{_ATOM}link"):
            if el.get("rel", "alternate") == "alternate" and el.get("href"):
                link = el.get("href")
                break
        item = _item(
            node.findtext(f"{_ATOM}title"),
            link,
            node.findtext(f"{_ATOM}summary"),
            node.findtext(f"{_ATOM}published") or node.findtext(f"{_ATOM}updated"),
            [c.get("term") for c in node.findall(f"{_ATOM}category") if c.get("term")],
        )
        if item:
            out.append(item)
    return out


# ── fetching ─────────────────────────────────────────────────────────────────

Fetcher = Callable[[str], Awaitable[httpx.Response]]


async def _default_fetch(url: str) -> httpx.Response:
    async with httpx.AsyncClient(
        timeout=15.0, headers={"User-Agent": USER_AGENT}, follow_redirects=True
    ) as client:
        return await client.get(url)


async def robots_allows(url: str, fetch: Fetcher) -> bool:
    """Honour the host's robots.txt for our user agent. A missing robots.txt
    (4xx) allows; an unreachable one (5xx, network error) does not."""
    parts = urlsplit(url)
    robots_url = f"{parts.scheme}://{parts.netloc}/robots.txt"
    try:
        resp = await fetch(robots_url)
    except httpx.HTTPError:
        return False
    if 400 <= resp.status_code < 500:
        return True
    if resp.status_code >= 500:
        return False
    rp = RobotFileParser()
    rp.parse(resp.text.splitlines())
    return rp.can_fetch(USER_AGENT, url)


async def fetch_source(source: NewsSource, fetch: Fetcher | None = None) -> list[ParsedItem]:
    fetch = fetch or _default_fetch
    if not await robots_allows(source.url, fetch):
        raise PermissionError(f"robots.txt disallows {source.url}")
    resp = await fetch(source.url)
    resp.raise_for_status()
    body = resp.content[:MAX_BODY_BYTES]
    if source.kind == "devto":
        items = parse_devto(resp.json())
    elif source.kind == "hn":
        items = parse_hn(resp.json())
    else:
        items = parse_feed(body)
    return items[:MAX_ITEMS_PER_RUN]


# ── storage ──────────────────────────────────────────────────────────────────


async def store_items(db: AsyncSession, source: NewsSource, items: list[ParsedItem]) -> int:
    """Insert new items; an already-known canonical URL (from any source) is
    skipped. Returns the number inserted. Commits."""
    if not items:
        return 0
    by_hash = {url_hash(i.url): i for i in items}
    known = set(
        (await db.execute(select(NewsItem.url_hash).where(NewsItem.url_hash.in_(by_hash)))).scalars()
    )
    now = datetime.now(UTC)
    added = 0
    for digest, item in by_hash.items():
        if digest in known:
            continue
        db.add(
            NewsItem(
                id=uuid.uuid4(),
                source=source.name,
                url=item.url,
                url_hash=digest,
                discussion_url=item.discussion_url,
                title=item.title,
                excerpt=item.excerpt,
                tags=item.tags,
                published_at=item.published_at or now,
                fetched_at=now,
            )
        )
        added += 1
    await db.commit()
    return added


async def prune(db: AsyncSession, days: int = RETENTION_DAYS) -> int:
    cutoff = datetime.now(UTC) - timedelta(days=days)
    result = await db.execute(delete(NewsItem).where(NewsItem.fetched_at < cutoff).execution_options(synchronize_session=False))
    await db.commit()
    return int(result.rowcount or 0)  # type: ignore[attr-defined]


async def purge_source(db: AsyncSession, name: str) -> int:
    """Remove everything a source contributed (used when permission is withdrawn)."""
    result = await db.execute(delete(NewsItem).where(NewsItem.source == name).execution_options(synchronize_session=False))
    await db.commit()
    return int(result.rowcount or 0)  # type: ignore[attr-defined]


async def import_news(
    db: AsyncSession, name: str, fetch: Fetcher | None = None
) -> dict[str, Any]:
    source = SOURCES_BY_NAME.get(name)
    if source is None:
        raise ValueError(f"unknown news source {name}")
    items = await fetch_source(source, fetch)
    saved = await store_items(db, source, items)
    pruned = await prune(db)
    logger.info("News import finished", source=name, fetched=len(items), saved=saved, pruned=pruned)
    return {"source": name, "fetched": len(items), "saved": saved, "pruned": pruned}
