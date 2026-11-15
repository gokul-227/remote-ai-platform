"""
Tell search engines about new job pages right after an import, instead of
waiting for them to re-crawl the sitemap.

- Google Indexing API (allowed for JobPosting pages): a service account that is
  an Owner of the Search Console property. Credentials come from
  GOOGLE_INDEXING_CREDENTIALS_B64 (base64 of the service-account JSON, kept in
  Infisical). Free quota is 200 publish requests a day: each run sends at most
  GOOGLE_INDEXING_PER_RUN, newest first, and every run draws from one shared
  daily budget (GOOGLE_INDEXING_DAILY_QUOTA, counted in Redis per UTC day) so
  frequent imports cannot exhaust it. New pages are announced as URL_UPDATED
  before expired ones are announced as URL_DELETED.
- IndexNow (Bing, Yandex, Seznam, Naver; Bing powers DuckDuckGo, Yahoo and
  ChatGPT search): a public key served at /indexnow.txt by the web app.

Production only: other environments are not indexable. Failures are logged and
never affect the import.
"""

import base64
import json
import time
import uuid

import httpx
import jwt

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("search.indexing")
GOOGLE_SCOPE = "https://www.googleapis.com/auth/indexing"
GOOGLE_PUBLISH = "https://indexing.googleapis.com/v3/urlNotifications:publish"
INDEXNOW = "https://api.indexnow.org/indexnow"


def _site() -> str:
    return settings.APP_URL.rstrip("/")


def job_urls(job_ids: list[uuid.UUID]) -> list[str]:
    return [f"{_site()}/jobs/{i}" for i in job_ids]


async def _google_token(client: httpx.AsyncClient, scope: str = GOOGLE_SCOPE) -> str | None:
    raw = settings.GOOGLE_INDEXING_CREDENTIALS_B64
    if not raw:
        return None
    info = json.loads(base64.b64decode(raw))
    now = int(time.time())
    assertion = jwt.encode(
        {
            "iss": info["client_email"],
            "scope": scope,
            "aud": info["token_uri"],
            "iat": now,
            "exp": now + 3600,
        },
        info["private_key"],
        algorithm="RS256",
        headers={"kid": info.get("private_key_id")},
    )
    r = await client.post(
        info["token_uri"],
        data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion},
    )
    r.raise_for_status()
    return str(r.json()["access_token"])


async def _reserve_google_quota(wanted: int) -> int:
    """Take up to `wanted` publish requests from today's shared budget. Without
    Redis, fall back to the per-run cap alone (the pre-budget behaviour)."""
    if wanted <= 0:
        return 0
    from datetime import UTC, datetime

    from redis.asyncio import Redis

    key = settings.redis_key(f"indexing:google:{datetime.now(UTC).date().isoformat()}")
    client = Redis.from_url(settings.redis_url, socket_connect_timeout=1, socket_timeout=1)
    try:
        used = int(await client.incrby(key, wanted))
        await client.expire(key, 2 * 86400)
        granted = max(0, min(wanted, settings.GOOGLE_INDEXING_DAILY_QUOTA - (used - wanted)))
        if granted < wanted:
            await client.decrby(key, wanted - granted)  # return what we won't use
        return granted
    except Exception:
        return wanted
    finally:
        await client.aclose()


async def _publish(
    client: httpx.AsyncClient, token: str, urls: list[str], kind: str
) -> tuple[int, bool]:
    """Send Google notifications; returns (accepted, quota_exhausted)."""
    accepted = 0
    for url in urls:
        r = await client.post(
            GOOGLE_PUBLISH,
            headers={"Authorization": f"Bearer {token}"},
            json={"url": url, "type": kind},
        )
        if r.status_code == 429:
            return accepted, True  # daily quota used up; the sitemap still covers the rest
        accepted += int(r.status_code == 200)
    return accepted, False


async def notify_jobs(
    new_ids: list[uuid.UUID], removed_ids: list[uuid.UUID] | None = None
) -> dict[str, int]:
    """Announce new job pages (URL_UPDATED) and expired ones (URL_DELETED) to Google,
    and every changed URL to IndexNow. Returns how many each accepted."""
    removed_ids = removed_ids or []
    sent = {"google": 0, "google_deleted": 0, "indexnow": 0}
    if settings.APP_ENV != "production" or not (new_ids or removed_ids):
        return sent
    new_urls, gone_urls = job_urls(new_ids), job_urls(removed_ids)
    async with httpx.AsyncClient(timeout=20) as client:
        try:
            token = await _google_token(client)
            if token:
                cap = settings.GOOGLE_INDEXING_PER_RUN
                want_new = new_urls[:cap]
                want_gone = gone_urls[: max(0, cap - len(want_new))]
                budget = await _reserve_google_quota(len(want_new) + len(want_gone))
                want_new = want_new[:budget]
                want_gone = want_gone[: max(0, budget - len(want_new))]
                sent["google"], exhausted = await _publish(client, token, want_new, "URL_UPDATED")
                if not exhausted:
                    sent["google_deleted"], _ = await _publish(
                        client, token, want_gone, "URL_DELETED"
                    )
        except Exception as exc:  # never let indexing break an import
            logger.warning("Google indexing notification failed", error=type(exc).__name__)
        changed = (new_urls + gone_urls)[:10000]
        if settings.INDEXNOW_KEY and changed:
            try:
                host = _site().split("://", 1)[-1]
                r = await client.post(
                    INDEXNOW,
                    json={
                        "host": host,
                        "key": settings.INDEXNOW_KEY,
                        "keyLocation": f"{_site()}/indexnow.txt",
                        "urlList": changed,
                    },
                )
                if r.status_code in (200, 202):
                    sent["indexnow"] = len(changed)
            except Exception as exc:
                logger.warning("IndexNow notification failed", error=type(exc).__name__)
    return sent


async def notify_new_jobs(job_ids: list[uuid.UUID]) -> dict[str, int]:
    """Announce new job pages to Google and IndexNow. Returns how many each accepted."""
    sent = await notify_jobs(job_ids)
    return {"google": sent["google"], "indexnow": sent["indexnow"]}


async def notify_removed_jobs(job_ids: list[uuid.UUID]) -> dict[str, int]:
    """Tell Google and IndexNow that expired job pages are gone (URL_DELETED)."""
    sent = await notify_jobs([], job_ids)
    return {"google": sent["google_deleted"], "indexnow": sent["indexnow"]}


SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
SEARCH_CONSOLE_SITE = "https://remoteaiplatform.com/"


async def search_console_report(days: int = 28) -> dict:
    """What Google shows for the site: sitemap and indexed counts, and the searches,
    pages, clicks and average position over the last `days` days (Search Console API)."""
    from datetime import UTC, datetime, timedelta
    from urllib.parse import quote

    site = quote(SEARCH_CONSOLE_SITE, safe="")
    base = f"https://www.googleapis.com/webmasters/v3/sites/{site}"
    end = datetime.now(UTC).date()
    start = end - timedelta(days=days)
    async with httpx.AsyncClient(timeout=30) as client:
        token = await _google_token(client, SEARCH_CONSOLE_SCOPE)
        if not token:
            return {"configured": False}
        h = {"Authorization": f"Bearer {token}"}

        async def analytics(dimension: str | None, limit: int) -> dict:
            body: dict = {"startDate": str(start), "endDate": str(end), "rowLimit": limit}
            if dimension:
                body["dimensions"] = [dimension]
            r = await client.post(f"{base}/searchAnalytics/query", headers=h, json=body)
            return r.json() if r.status_code == 200 else {}

        sitemaps = (await client.get(f"{base}/sitemaps", headers=h)).json().get("sitemap", [])
        totals = (await analytics(None, 1)).get("rows", [{}])
        queries = (await analytics("query", 25)).get("rows", [])
        pages = (await analytics("page", 25)).get("rows", [])

    def rows(items: list[dict]) -> list[dict]:
        return [
            {
                "key": r["keys"][0],
                "clicks": r.get("clicks", 0),
                "impressions": r.get("impressions", 0),
                "position": round(r.get("position", 0), 1),
            }
            for r in items
        ]

    t = totals[0] if totals else {}
    return {
        "configured": True,
        "site": SEARCH_CONSOLE_SITE,
        "period_days": days,
        "sitemaps": [
            {
                "path": m.get("path"),
                "last_read": m.get("lastDownloaded"),
                "errors": int(m.get("errors", 0)),
                "submitted": sum(int(c.get("submitted", 0)) for c in m.get("contents", [])),
                "indexed": sum(int(c.get("indexed", 0)) for c in m.get("contents", [])),
            }
            for m in sitemaps
        ],
        "clicks": t.get("clicks", 0),
        "impressions": t.get("impressions", 0),
        "average_position": round(t.get("position", 0), 1) if t else None,
        "top_queries": rows(queries),
        "top_pages": rows(pages),
    }
