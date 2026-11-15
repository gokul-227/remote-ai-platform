"""Public employment-service and partner job APIs.

All of them are incremental: the import checkpoint stores when the last
successful fetch started (``cursor["since"]``) and the next run asks only for
postings published after that (first run: the last INITIAL_DAYS days). Every
adapter is skipped (SourceDisabledError) when its key is missing.

Terms and limits (read November 2026):
- Bundesagentur für Arbeit Jobsuche (Germany): open REST API used by the
  official Jobsuche apps; the documented public client id is sent as
  ``X-API-Key``. No published quota: we read at most BUNDESAGENTUR_MAX_PAGES
  pages of 100 per run, sequentially. Links go to the official job detail page.
- JobTech JobSearch (Arbetsförmedlingen, Sweden): open data under CC0, no key;
  ``published-after`` gives incremental reads; offset is capped at 2000.
- NAV stillingsfeed (Norway): public feed of arbeidsplassen.no; a public bearer
  token is published at /api/publicToken (or set NAV_FEED_TOKEN). The feed is
  read forward from the stored page id; the first run starts at the newest page.
- France Travail Offres d'emploi v2: free partner account (FRANCE_TRAVAIL_CLIENT_ID
  / FRANCE_TRAVAIL_CLIENT_SECRET), OAuth client credentials; 150 results per
  request via ``range``; documented limit ~10 calls/s, we make one at a time.
- Careerjet partner API v4: affiliate key (CAREERJET_API_KEY) as HTTP basic-auth
  user; requires the end user's IP/user agent, for which a server value is sent
  as Careerjet allows for back-end imports. Partner terms require keeping
  Careerjet's tracking URL as the apply link.
- Job Bank Canada open data and EURES are not adapters: Job Bank's monthly
  open-data CSV carries no employer name or posting URL, and EURES offers no
  public API without a partner agreement (see docs/product/job-sources.md).
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.core.config import settings
from app.domains.jobs.aggregators import robots
from app.domains.jobs.aggregators.base import (
    SourceDisabledError,
    SourceFetchError,
    require_list,
)
from app.domains.jobs.aggregators.public_boards import _Board
from app.domains.jobs.schemas import JobPostCreate

TIMEOUT = httpx.Timeout(30.0)
INITIAL_DAYS = 7


def _client(**kw: Any) -> httpx.AsyncClient:
    headers = {"User-Agent": robots.user_agent(), **kw.pop("headers", {})}
    return httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, headers=headers, **kw)


class _Incremental(_Board):
    """Date-checkpointed source: `since()` is where to resume."""

    def since(self, now: datetime | None = None) -> datetime:
        now = now or datetime.now(UTC)
        raw = self.cursor.get("since")
        try:
            parsed = datetime.fromisoformat(raw) if isinstance(raw, str) else None
        except ValueError:
            parsed = None
        floor = now - timedelta(days=settings.JOB_RETENTION_DAYS)
        start = parsed if parsed is not None else now - timedelta(days=INITIAL_DAYS)
        if start.tzinfo is None:
            start = start.replace(tzinfo=UTC)
        # Overlap by an hour so postings indexed late are not missed.
        return max(floor, start - timedelta(hours=1))

    def mark(self, started: datetime, **extra: Any) -> None:
        self.next_cursor = {"since": started.isoformat(), **extra}


class BundesagenturAggregator(_Incremental):
    source_name = "BUNDESAGENTUR"
    url = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        if not settings.BUNDESAGENTUR_API_KEY:
            raise SourceDisabledError("BUNDESAGENTUR_API_KEY not set")
        started = datetime.now(UTC)
        days = max(1, min(100, math.ceil((started - self.since(started)).total_seconds() / 86400)))
        out: list[JobPostCreate] = []
        try:
            async with _client(headers={"X-API-Key": settings.BUNDESAGENTUR_API_KEY}) as c:
                for page in range(1, settings.BUNDESAGENTUR_MAX_PAGES + 1):
                    r = await c.get(
                        self.url,
                        params={
                            "angebotsart": 1,
                            "veroeffentlichtseit": days,
                            "size": 100,
                            "page": page,
                        },
                    )
                    r.raise_for_status()
                    payload = r.json()
                    items = payload.get("stellenangebote") or payload.get("ergebnisliste") or []
                    if not isinstance(items, list):
                        raise SourceFetchError("payload is not a list")
                    for it in items:
                        job = self._from(it)
                        if job:
                            out.append(job)
                    total = int(payload.get("maxErgebnisse") or 0)
                    if len(items) < 100 or page * 100 >= total or len(out) >= limit:
                        break
        except (SourceFetchError, SourceDisabledError):
            raise
        except Exception as exc:
            raise SourceFetchError(type(exc).__name__) from exc
        self.mark(started)
        return out[:limit]

    def _from(self, it: dict[str, Any]) -> JobPostCreate | None:
        ref = it.get("refnr") or it.get("referenznummer")
        if not ref:
            return None
        places = it.get("stellenlokationen") or [{"adresse": it.get("arbeitsort") or {}}]
        addr = (places[0] or {}).get("adresse") or {}
        where = ", ".join(x for x in (addr.get("ort"), addr.get("region"), "Germany") if x)
        home = bool(it.get("homeofficemoeglich"))
        low, high = it.get("gehaltsspanneVon"), it.get("gehaltsspanneBis")
        yearly = it.get("verguetungsangabe") == "JAHRESGEHALT"
        title = it.get("stellenangebotsTitel") or it.get("titel") or it.get("beruf") or ""
        return self._job(
            ext_id=str(ref),
            title=title,
            company=it.get("firma") or it.get("arbeitgeber") or "",
            url=f"https://www.arbeitsagentur.de/jobsuche/jobdetail/{ref}",
            description=" · ".join(
                x for x in (title, it.get("hauptberuf"), *(it.get("alleBerufe") or [])) if x
            ),
            location=where,
            job_type="full-time" if it.get("arbeitszeitVollzeit") else None,
            remote=None if home else False,
            salary=(low, high, "EUR") if yearly else (None, None, None),
            posted_at=it.get("datumErsteVeroeffentlichung")
            or it.get("aktuelleVeroeffentlichungsdatum"),
        )


class JobTechAggregator(_Incremental):
    source_name = "JOBTECH"
    url = "https://jobsearch.api.jobtechdev.se/search"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        started = datetime.now(UTC)
        since = self.since(started).strftime("%Y-%m-%dT%H:%M:%S")
        out: list[JobPostCreate] = []
        try:
            async with _client(headers={"Accept": "application/json"}) as c:
                for page in range(settings.JOBTECH_MAX_PAGES):
                    offset = page * 100
                    if offset > 2000:
                        break
                    r = await c.get(
                        self.url,
                        params={
                            "published-after": since,
                            "limit": 100,
                            "offset": offset,
                            "sort": "pubdate-desc",
                        },
                    )
                    r.raise_for_status()
                    hits = require_list(r.json(), "hits")
                    for it in hits:
                        job = self._from(it)
                        if job:
                            out.append(job)
                    if len(hits) < 100 or len(out) >= limit:
                        break
        except SourceFetchError:
            raise
        except Exception as exc:
            raise SourceFetchError(type(exc).__name__) from exc
        self.mark(started)
        return out[:limit]

    def _from(self, it: dict[str, Any]) -> JobPostCreate | None:
        if it.get("removed"):
            return None
        addr = it.get("workplace_address") or {}
        where = ", ".join(x for x in (addr.get("municipality") or addr.get("city"), "Sweden") if x)
        model = str((it.get("workplace_model") or {}).get("label") or "").lower()
        return self._job(
            ext_id=str(it.get("id")),
            title=it.get("headline") or "",
            company=(it.get("employer") or {}).get("name") or "",
            url=it.get("webpage_url") or (it.get("application_details") or {}).get("url"),
            description=(it.get("description") or {}).get("text") or "",
            location=where,
            job_type=(it.get("working_hours_type") or {}).get("label"),
            remote=True if "distans" in model or "remote" in model else None,
            posted_at=it.get("publication_date"),
        )


class NAVAggregator(_Board):
    """Norway's arbeidsplassen.no feed; cursor = next feed page id."""

    source_name = "NAV"
    base = "https://pam-stilling-feed.nav.no"

    async def _token(self, c: httpx.AsyncClient) -> str:
        if settings.NAV_FEED_TOKEN:
            return settings.NAV_FEED_TOKEN
        r = await c.get(f"{self.base}/api/publicToken")
        r.raise_for_status()
        token = r.text.strip().splitlines()[-1].strip()
        if token.count(".") != 2:
            raise SourceFetchError("NAV public token not found")
        return token

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        out: list[JobPostCreate] = []
        page_id = self.cursor.get("page")
        try:
            async with _client() as c:
                auth = {"Authorization": f"Bearer {await self._token(c)}"}
                url = (
                    f"{self.base}/api/v1/feed/{page_id}"
                    if page_id
                    else f"{self.base}/api/v1/feed?last=true"
                )
                for _ in range(settings.NAV_MAX_PAGES):
                    r = await c.get(url, headers=auth)
                    r.raise_for_status()
                    feed = r.json()
                    for it in require_list(feed, "items"):
                        job = self._from(it)
                        if job:
                            out.append(job)
                    page_id = feed.get("id") or page_id
                    nxt = feed.get("next_id")
                    if not nxt or len(out) >= limit:
                        # Resume at the next page if there is one, else re-read this one.
                        page_id = nxt or page_id
                        break
                    page_id = nxt
                    url = f"{self.base}/api/v1/feed/{nxt}"
        except SourceFetchError:
            raise
        except Exception as exc:
            raise SourceFetchError(type(exc).__name__) from exc
        self.next_cursor = {"page": page_id}
        return out[:limit]

    def _from(self, it: dict[str, Any]) -> JobPostCreate | None:
        entry = it.get("_feed_entry") or {}
        if entry.get("status") != "ACTIVE":
            return None
        uuid = entry.get("uuid") or it.get("id")
        municipal = (entry.get("municipal") or "").title()
        return self._job(
            ext_id=str(uuid),
            title=entry.get("title") or it.get("title") or "",
            company=(entry.get("businessName") or "").title(),
            url=f"https://arbeidsplassen.nav.no/stillinger/stilling/{uuid}",
            description=entry.get("title") or it.get("title") or "",
            location=", ".join(x for x in (municipal, "Norway") if x),
            posted_at=entry.get("sistEndret") or it.get("date_modified"),
        )


class FranceTravailAggregator(_Incremental):
    source_name = "FRANCETRAVAIL"
    token_url = "https://entreprise.francetravail.fr/connexion/oauth2/access_token"
    url = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        if not (settings.FRANCE_TRAVAIL_CLIENT_ID and settings.FRANCE_TRAVAIL_CLIENT_SECRET):
            raise SourceDisabledError(
                "FRANCE_TRAVAIL_CLIENT_ID/FRANCE_TRAVAIL_CLIENT_SECRET not set"
            )
        started = datetime.now(UTC)
        fmt = "%Y-%m-%dT%H:%M:%SZ"
        out: list[JobPostCreate] = []
        try:
            async with _client() as c:
                t = await c.post(
                    self.token_url,
                    params={"realm": "/partenaire"},
                    data={
                        "grant_type": "client_credentials",
                        "client_id": settings.FRANCE_TRAVAIL_CLIENT_ID,
                        "client_secret": settings.FRANCE_TRAVAIL_CLIENT_SECRET,
                        "scope": "api_offresdemploiv2 o2dsoffre",
                    },
                )
                t.raise_for_status()
                auth = {"Authorization": f"Bearer {t.json()['access_token']}"}
                for page in range(settings.FRANCE_TRAVAIL_MAX_PAGES):
                    r = await c.get(
                        self.url,
                        headers=auth,
                        params={
                            "range": f"{page * 150}-{page * 150 + 149}",
                            "minCreationDate": self.since(started).strftime(fmt),
                            "maxCreationDate": started.strftime(fmt),
                            "sort": 1,
                        },
                    )
                    if r.status_code == 204:
                        break
                    r.raise_for_status()
                    items = require_list(r.json(), "resultats")
                    for it in items:
                        job = self._from(it)
                        if job:
                            out.append(job)
                    if len(items) < 150 or len(out) >= limit:
                        break
        except (SourceFetchError, SourceDisabledError):
            raise
        except Exception as exc:
            raise SourceFetchError(type(exc).__name__) from exc
        self.mark(started)
        return out[:limit]

    def _from(self, it: dict[str, Any]) -> JobPostCreate | None:
        oid = it.get("id")
        origin = (it.get("origineOffre") or {}).get("urlOrigine")
        return self._job(
            ext_id=str(oid),
            title=it.get("intitule") or "",
            company=(it.get("entreprise") or {}).get("nom") or "",
            url=origin or f"https://candidat.francetravail.fr/offres/recherche/detail/{oid}",
            description=it.get("description") or "",
            location=", ".join(
                x for x in ((it.get("lieuTravail") or {}).get("libelle"), "France") if x
            ),
            job_type=it.get("typeContratLibelle"),
            posted_at=it.get("dateCreation"),
        )


class CareerjetAggregator(_Board):
    source_name = "CAREERJET"
    url = "https://search.api.careerjet.net/v4/query"

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        if not settings.CAREERJET_API_KEY:
            raise SourceDisabledError("CAREERJET_API_KEY not set")
        locales = [x.strip() for x in settings.CAREERJET_LOCALES.split(",") if x.strip()]

        async def fetch(client: httpx.AsyncClient, locale: str) -> list[JobPostCreate]:
            out: list[JobPostCreate] = []
            for page in range(1, settings.CAREERJET_MAX_PAGES + 1):
                r = await client.get(
                    self.url,
                    auth=(settings.CAREERJET_API_KEY or "", ""),
                    params={
                        "locale_code": locale,
                        "keywords": "remote",
                        "sort": "date",
                        "page": page,
                        "page_size": 100,
                        "user_ip": "127.0.0.1",
                        "user_agent": robots.user_agent(),
                    },
                )
                r.raise_for_status()
                items = require_list(r.json(), "jobs")
                for it in items:
                    job = self._job(
                        ext_id=f"{locale}_{it.get('url')}",
                        title=it.get("title", ""),
                        company=it.get("company", ""),
                        url=it.get("url"),
                        description=it.get("description") or "",
                        location=it.get("locations"),
                        salary=(
                            it.get("salary_min"),
                            it.get("salary_max"),
                            it.get("salary_currency_code"),
                        )
                        if it.get("salary_type") in (None, "Y")
                        else (None, None, None),
                        posted_at=it.get("date"),
                    )
                    if job:
                        out.append(job)
                if len(items) < 100:
                    break
            return out

        return await self._many(locales, fetch, limit)


GOVERNMENT_AGGREGATORS = (
    BundesagenturAggregator,
    JobTechAggregator,
    NAVAggregator,
    FranceTravailAggregator,
    CareerjetAggregator,
)
