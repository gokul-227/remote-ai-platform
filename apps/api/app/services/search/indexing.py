"""
Tell search engines about new job pages right after an import, instead of
waiting for them to re-crawl the sitemap.

- Google Indexing API (allowed for JobPosting pages): a service account that is
  an Owner of the Search Console property. Credentials come from
  GOOGLE_INDEXING_CREDENTIALS_B64 (base64 of the service-account JSON, kept in
  Infisical). Free quota is 200 notifications a day, so each run sends at most
  GOOGLE_INDEXING_PER_RUN, newest first.
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


async def _google_token(client: httpx.AsyncClient) -> str | None:
    raw = settings.GOOGLE_INDEXING_CREDENTIALS_B64
    if not raw:
        return None
    info = json.loads(base64.b64decode(raw))
    now = int(time.time())
    assertion = jwt.encode(
        {
            "iss": info["client_email"],
            "scope": GOOGLE_SCOPE,
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


async def notify_new_jobs(job_ids: list[uuid.UUID]) -> dict[str, int]:
    """Announce new job pages to Google and IndexNow. Returns how many each accepted."""
    sent = {"google": 0, "indexnow": 0}
    if settings.APP_ENV != "production" or not job_ids:
        return sent
    urls = job_urls(job_ids)
    async with httpx.AsyncClient(timeout=20) as client:
        try:
            token = await _google_token(client)
            if token:
                for url in urls[: settings.GOOGLE_INDEXING_PER_RUN]:
                    r = await client.post(
                        GOOGLE_PUBLISH,
                        headers={"Authorization": f"Bearer {token}"},
                        json={"url": url, "type": "URL_UPDATED"},
                    )
                    if r.status_code == 429:
                        break  # daily quota used up; the sitemap still covers the rest
                    sent["google"] += int(r.status_code == 200)
        except Exception as exc:  # never let indexing break an import
            logger.warning("Google indexing notification failed", error=type(exc).__name__)
        if settings.INDEXNOW_KEY:
            try:
                host = _site().split("://", 1)[-1]
                r = await client.post(
                    INDEXNOW,
                    json={
                        "host": host,
                        "key": settings.INDEXNOW_KEY,
                        "keyLocation": f"{_site()}/indexnow.txt",
                        "urlList": urls[:10000],
                    },
                )
                if r.status_code in (200, 202):
                    sent["indexnow"] = len(urls[:10000])
            except Exception as exc:
                logger.warning("IndexNow notification failed", error=type(exc).__name__)
    return sent
