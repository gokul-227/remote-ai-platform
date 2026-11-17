"""robots.txt checks for job-source fetches (RFC 9309 semantics).

Each host's robots.txt is read once and cached for ROBOTS_CACHE_SECONDS per
process. A 4xx answer means "no rules" (allowed); a 5xx answer or a transport
error means "assume disallowed" until the cache expires, as the RFC asks.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import httpx

from app.core.config import settings

ROBOTS_CACHE_SECONDS = 24 * 3600
_cache: dict[str, tuple[float, RobotFileParser | None, bool]] = {}


def user_agent() -> str:
    return settings.JOB_SOURCE_USER_AGENT


def _agent_token() -> str:
    return user_agent().split("/", 1)[0]


def clear_cache() -> None:
    _cache.clear()


async def allowed(client: httpx.AsyncClient, url: str) -> bool:
    """May our crawler fetch `url`? Always True when JOB_SOURCE_RESPECT_ROBOTS is off."""
    if not settings.JOB_SOURCE_RESPECT_ROBOTS:
        return True
    parts = urlsplit(url)
    origin = f"{parts.scheme}://{parts.netloc}"
    now = time.monotonic()
    hit = _cache.get(origin)
    if hit is None or now - hit[0] > ROBOTS_CACHE_SECONDS:
        parser: RobotFileParser | None = None
        default = False
        try:
            r = await client.get(f"{origin}/robots.txt", headers={"User-Agent": user_agent()})
            if r.status_code >= 500:
                default = False
            elif r.status_code >= 400:
                default = True
            else:
                parser = RobotFileParser()
                parser.parse(r.text.splitlines())
        except Exception:
            default = False
        hit = (now, parser, default)
        _cache[origin] = hit
    _, parser, default = hit
    if parser is None:
        return default
    target = parts.path or "/"
    if parts.query:
        target += "?" + parts.query
    return parser.can_fetch(_agent_token(), f"{origin}{target}")


def crawl_delay(url: str) -> float | None:
    """The Crawl-delay robots.txt asks of our agent for `url`'s host, once that
    host's rules are cached by allowed(); None when there is none."""
    parts = urlsplit(url)
    hit = _cache.get(f"{parts.scheme}://{parts.netloc}")
    if hit is None or hit[1] is None:
        return None
    try:
        delay = hit[1].crawl_delay(_agent_token())
    except Exception:
        return None
    return float(delay) if delay else None


def rate_key(url: str) -> str:
    """Rate-limit key for a URL: the host's last two labels, so every company
    subdomain of one ATS (x.teamtailor.com, y.teamtailor.com) shares one limit."""
    host = (urlsplit(url).hostname or "").lower()
    return ".".join(host.split(".")[-2:])


class HostLimiter:
    """At most one request per `interval` seconds per rate key (robots.txt
    Crawl-delay raises the gap when larger). Waiters for one key queue in order."""

    def __init__(self, interval: float, *, sleep: Any = None, clock: Any = None) -> None:
        self.interval = max(0.0, interval)
        self._sleep = sleep or asyncio.sleep
        self._clock = clock or time.monotonic
        self._next: dict[str, float] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    async def wait(self, url: str) -> None:
        key = rate_key(url)
        gap = max(self.interval, crawl_delay(url) or 0.0)
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            now = self._clock()
            due = self._next.get(key, 0.0)
            if due > now:
                await self._sleep(due - now)
                now = due
            self._next[key] = now + gap
