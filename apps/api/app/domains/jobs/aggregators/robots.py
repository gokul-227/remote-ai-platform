"""robots.txt checks for job-source fetches (RFC 9309 semantics).

Each host's robots.txt is read once and cached for ROBOTS_CACHE_SECONDS per
process. A 4xx answer means "no rules" (allowed); a 5xx answer or a transport
error means "assume disallowed" until the cache expires, as the RFC asks.
"""

from __future__ import annotations

import time
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
