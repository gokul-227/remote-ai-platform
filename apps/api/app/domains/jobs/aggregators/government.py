"""Public employment-service and partner job APIs.

Bundesagentur, JobTech and NAV read their whole catalogue in checkpointed
sweeps bounded by the run's time budget (see each class). France Travail is
incremental: the checkpoint stores when the last successful fetch started
(``cursor["since"]``; first run: the last INITIAL_DAYS days). Every adapter is
skipped (SourceDisabledError) when its key is missing.

Terms and limits (read November 2026):
- Bundesagentur für Arbeit Jobsuche (Germany): open REST API used by the
  official Jobsuche apps; the documented public client id is sent as
  ``X-API-Key``. No published quota: requests are sequential and swept in facet
  partitions (one query reaches 10,000 results) within the run's time budget.
  Links go to the official job detail page.
- JobTech JobSearch (Arbetsförmedlingen, Sweden): open data under CC0, no key;
  swept in publication-date windows (offset is capped at 2000 per query).
- NAV stillingsfeed (Norway): public feed of arbeidsplassen.no; a public bearer
  token is published at /api/publicToken (or set NAV_FEED_TOKEN). The feed is
  walked from its first page, then forward from the stored page id.
- Not added (Nov 2026): Switzerland's job-room.ch asks crawlers not to read job
  adverts in robots.txt; the Netherlands' UWV (werk.nl) has no public jobs API;
  EURES needs a partner agreement.
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


class BundesagenturAggregator(_Board):
    """Germany's Jobsuche. One query reaches at most 10,000 results (page * size),
    while the catalogue holds ~780,000 postings (measured Nov 2026). Runs sweep the
    whole catalogue in partitions that each fit under the cap: by occupational
    field, then working time, contract type and temporary-agency flag, using the
    facet counts the API returns. The partition queue and page are checkpointed, so
    a sweep spans several runs; when it completes, postings not seen since it
    started are expired."""

    source_name = "BUNDESAGENTUR"
    url = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs"
    PAGE = 100
    CAP = 10000
    # Split dimensions, in order (query parameter = facet name).
    SPLITS = ("berufsfeld", "arbeitszeit", "befristung", "zeitarbeit")

    def _children(self, part: dict[str, str], facets: object) -> list[dict[str, str]]:
        """Sub-partitions of `part` along its next split dimension (empty when
        every dimension is used or the facet is missing)."""
        if not isinstance(facets, dict):
            return []
        for dim in self.SPLITS:
            if dim in part:
                continue
            counts = (facets.get(dim) or {}).get("counts") or {}
            values = sorted(str(v) for v, n in counts.items() if n)
            if len(values) > 1:
                return [{**part, dim: v} for v in values]
        return []

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        if not settings.BUNDESAGENTUR_API_KEY:
            raise SourceDisabledError("BUNDESAGENTUR_API_KEY not set")
        queue: list[dict[str, str]] = [dict(p) for p in self.cursor.get("queue") or []]
        page = int(self.cursor.get("page") or 1)
        started_raw = self.cursor.get("sweep_started")
        if not queue:
            queue, page, started_raw = [{}], 1, datetime.now(UTC).isoformat()
        out: list[JobPostCreate] = []
        seen: set[str] = set()
        requests = 0
        try:
            async with _client(headers={"X-API-Key": settings.BUNDESAGENTUR_API_KEY}) as c:
                while queue and requests < settings.BUNDESAGENTUR_MAX_PAGES:
                    if len(out) >= limit or self.out_of_time():
                        break
                    part = queue[0]
                    r = await c.get(
                        self.url,
                        params={"angebotsart": 1, "size": self.PAGE, "page": page, **part},
                    )
                    requests += 1
                    r.raise_for_status()
                    payload = r.json()
                    items = payload.get("stellenangebote") or payload.get("ergebnisliste") or []
                    if not isinstance(items, list):
                        raise SourceFetchError("payload is not a list")
                    for it in items:
                        ref = str(it.get("refnr") or it.get("referenznummer") or "")
                        if ref in seen:
                            continue
                        seen.add(ref)
                        job = self._from(it)
                        if job:
                            out.append(job)
                    total = int(payload.get("maxErgebnisse") or 0)
                    if page == 1 and total > self.CAP:
                        children = self._children(part, payload.get("facetten"))
                        if children:
                            queue[0:1] = children
                            continue
                    if len(items) < self.PAGE or page * self.PAGE >= min(total, self.CAP):
                        queue.pop(0)
                        page = 1
                    else:
                        page += 1
        except (SourceFetchError, SourceDisabledError):
            raise
        except Exception as exc:
            raise SourceFetchError(type(exc).__name__) from exc
        if queue:
            self.next_cursor = {"queue": queue, "page": page, "sweep_started": started_raw}
        else:
            self.next_cursor = {}
            self.sweep_started = datetime.fromisoformat(str(started_raw))
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


class JobTechAggregator(_Board):
    """Sweden's JobSearch (CC0). A query reaches offset 2,000, so each sweep walks
    publication-date windows (one day, halved while a window holds more than the
    cap) back over the retention period; ~42,000 ads (Nov 2026) take a few
    hundred requests. The window queue is checkpointed; a finished sweep expires
    ads that are no longer listed."""

    source_name = "JOBTECH"
    url = "https://jobsearch.api.jobtechdev.se/search"
    PAGE = 100
    CAP = 2000
    FMT = "%Y-%m-%dT%H:%M:%S"

    def _windows(self, now: datetime) -> list[list[str]]:
        out = []
        end = now
        floor = now - timedelta(days=settings.JOB_RETENTION_DAYS)
        while end > floor:
            start = max(floor, end - timedelta(days=1))
            out.append([start.strftime(self.FMT), end.strftime(self.FMT)])
            end = start
        return out

    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        now = datetime.now(UTC)
        windows: list[list[str]] = [list(w) for w in self.cursor.get("windows") or []]
        started_raw = self.cursor.get("sweep_started")
        if not windows:
            windows, started_raw = self._windows(now), now.isoformat()
        out: list[JobPostCreate] = []
        seen: set[str] = set()
        requests = 0
        try:
            async with _client(headers={"Accept": "application/json"}) as c:
                while windows and requests < settings.JOBTECH_MAX_PAGES:
                    if len(out) >= limit or self.out_of_time():
                        break
                    after, before = windows[0]
                    a = datetime.strptime(after, self.FMT)
                    b = datetime.strptime(before, self.FMT)
                    offset = 0
                    split = False
                    while offset <= self.CAP:
                        r = await c.get(
                            self.url,
                            params={
                                "published-after": after,
                                "published-before": before,
                                "limit": self.PAGE,
                                "offset": offset,
                                "sort": "pubdate-desc",
                            },
                        )
                        requests += 1
                        r.raise_for_status()
                        payload = r.json()
                        hits = require_list(payload, "hits")
                        total = int((payload.get("total") or {}).get("value") or 0)
                        if (
                            offset == 0
                            and total > self.CAP + self.PAGE
                            and b - a > timedelta(hours=1)
                        ):
                            mid = (a + (b - a) / 2).strftime(self.FMT)
                            windows[0:1] = [[mid, before], [after, mid]]
                            split = True
                            break
                        for it in hits:
                            key = str(it.get("id"))
                            if key in seen:
                                continue
                            seen.add(key)
                            job = self._from(it)
                            if job:
                                out.append(job)
                        offset += self.PAGE
                        if len(hits) < self.PAGE or offset >= total:
                            break
                    if not split:
                        windows.pop(0)
        except SourceFetchError:
            raise
        except Exception as exc:
            raise SourceFetchError(type(exc).__name__) from exc
        if windows:
            self.next_cursor = {"windows": windows, "sweep_started": started_raw}
        else:
            self.next_cursor = {}
            self.sweep_started = datetime.fromisoformat(str(started_raw))
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
        """Walk the feed forward from the checkpoint. A full walk starts at the
        feed's first page (2023) and catches up over one or more runs; after that
        each run reads only new pages, and every NAV_REWALK_DAYS the walk starts
        over so unchanged open ads are seen again. INACTIVE entries close ads."""
        now = datetime.now(UTC)
        page_id = self.cursor.get("page")
        walk_started = self.cursor.get("walk_started")
        done_raw = self.cursor.get("walk_done_at")
        try:
            done_at = datetime.fromisoformat(done_raw) if done_raw else None
        except ValueError:
            done_at = None
        if not page_id or (
            done_at is not None and now - done_at > timedelta(days=settings.NAV_REWALK_DAYS)
        ):
            page_id, walk_started, done_raw = None, now.isoformat(), None
        latest: dict[str, dict[str, Any]] = {}
        caught_up = False
        try:
            async with _client() as c:
                auth = {"Authorization": f"Bearer {await self._token(c)}"}
                url = f"{self.base}/api/v1/feed/{page_id}" if page_id else f"{self.base}/api/v1/feed"
                for _ in range(settings.NAV_MAX_PAGES):
                    r = await c.get(url, headers=auth)
                    r.raise_for_status()
                    feed = r.json()
                    for it in require_list(feed, "items"):
                        entry = it.get("_feed_entry") or {}
                        key = str(entry.get("uuid") or it.get("id") or "")
                        if key:
                            latest.pop(key, None)  # the latest entry of an ad wins
                            latest[key] = it
                    page_id = feed.get("id") or page_id
                    nxt = feed.get("next_id")
                    if not nxt:
                        caught_up = True
                        break
                    page_id = nxt
                    url = f"{self.base}/api/v1/feed/{nxt}"
                    if self.out_of_time() or len(latest) >= limit:
                        break
        except SourceFetchError:
            raise
        except Exception as exc:
            raise SourceFetchError(type(exc).__name__) from exc
        out: list[JobPostCreate] = []
        for key, it in latest.items():
            if (it.get("_feed_entry") or {}).get("status") == "ACTIVE":
                job = self._from(it)
                if job:
                    out.append(job)
            else:
                self.removed_ids.append(self.ext(key))
        if caught_up and walk_started and not done_raw:
            done_raw = now.isoformat()
            self.sweep_started = datetime.fromisoformat(walk_started)
        self.next_cursor = {"page": page_id, "walk_started": walk_started, "walk_done_at": done_raw}
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


def _content_range_total(header: str) -> int:
    """Total from France Travail's ``Content-Range: offres 0-149/12345``."""
    try:
        return int(header.rsplit("/", 1)[1])
    except (IndexError, ValueError):
        return 0


# Départements (incl. Corsica and overseas) for partitioned France Travail queries.
DEPARTEMENTS = (
    *[f"{n:02d}" for n in range(1, 96) if n != 20],
    "2A",
    "2B",
    "971",
    "972",
    "973",
    "974",
    "976",
)


class FranceTravailAggregator(_Incremental):
    source_name = "FRANCETRAVAIL"
    CAP = 3150
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
                # One query reaches 3,150 results (range <= 3149): a busier window
                # is read per département instead.
                parts: list[dict[str, str]] = [{}]
                requests = 0
                while parts and requests < settings.FRANCE_TRAVAIL_MAX_PAGES:
                    part = parts.pop(0)
                    for page in range(21):
                        if len(out) >= limit or self.out_of_time():
                            break
                        r = await c.get(
                            self.url,
                            headers=auth,
                            params={
                                "range": f"{page * 150}-{page * 150 + 149}",
                                "minCreationDate": self.since(started).strftime(fmt),
                                "maxCreationDate": started.strftime(fmt),
                                "sort": 1,
                                **part,
                            },
                        )
                        requests += 1
                        if r.status_code == 204:
                            break
                        r.raise_for_status()
                        total = _content_range_total(r.headers.get("content-range", ""))
                        if page == 0 and not part and total > self.CAP:
                            parts = [{"departement": d} for d in DEPARTEMENTS]
                            break
                        items = require_list(r.json(), "resultats")
                        for it in items:
                            job = self._from(it)
                            if job:
                                out.append(job)
                        if len(items) < 150:
                            break
        except (SourceFetchError, SourceDisabledError):
            raise
        except Exception as exc:
            raise SourceFetchError(type(exc).__name__) from exc
        if not parts and not self.out_of_time() and len(out) < limit:
            self.mark(started)  # else the next run reads the same window again
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
