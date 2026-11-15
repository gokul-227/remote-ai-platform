"""Curated company board lists for the ATS adapters.

Each ATS has a plain-text data file in ``boards/`` (one board token per line,
``#`` comments allowed). The files were assembled from public employer career
links (e.g. the monthly Hacker News "Who is hiring?" threads read through the
public Algolia HN API) and the lists that were already configured in settings;
no GitHub-hosted job data was used. The files are loaded into the
``job_source_boards`` table (``sync_board_rows``), where staff validate boards
with the rate-limited tool in ``app/domains/jobs/board_validation.py`` and can
switch individual boards off. Validation never runs at import time.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from app.core.config import settings

DATA_DIR = Path(__file__).parent / "boards"

# job_sources name -> (data file, extra comma-separated setting)
BOARD_SOURCES: dict[str, tuple[str, str]] = {
    "GREENHOUSE": ("greenhouse.txt", "GREENHOUSE_BOARDS"),
    "LEVER": ("lever.txt", "LEVER_BOARDS"),
    "ASHBY": ("ashby.txt", "ASHBY_BOARDS"),
    "SMARTRECRUITERS": ("smartrecruiters.txt", "SMARTRECRUITERS_COMPANIES"),
    "WORKABLE": ("workable.txt", "WORKABLE_ACCOUNTS"),
    "RECRUITEE": ("recruitee.txt", "RECRUITEE_COMPANIES"),
    "PERSONIO": ("personio.txt", "PERSONIO_COMPANIES"),
    "TEAMTAILOR": ("teamtailor.txt", "TEAMTAILOR_COMPANIES"),
    "BAMBOOHR": ("bamboohr.txt", "BAMBOOHR_COMPANIES"),
    "BREEZY": ("breezy.txt", "BREEZY_COMPANIES"),
    "RIPPLING": ("rippling.txt", "RIPPLING_BOARDS"),
    "WORKDAY": ("workday.txt", "WORKDAY_SITES"),
}


@lru_cache(maxsize=32)
def _file_tokens(filename: str) -> tuple[str, ...]:
    path = DATA_DIR / filename
    if not path.exists():
        return ()
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        token = line.split("#", 1)[0].strip()
        if token:
            out.append(token)
    return tuple(out)


def configured_boards(source: str) -> list[str]:
    """Bundled list + the source's setting, de-duplicated case-insensitively
    (first spelling wins; Ashby/SmartRecruiters/Workday tokens are case-sensitive)."""
    filename, setting = BOARD_SOURCES[source]
    raw = [b.strip() for b in str(getattr(settings, setting, "") or "").split(",")]
    seen: set[str] = set()
    out: list[str] = []
    bundled = _file_tokens(filename) if settings.ATS_BUNDLED_LISTS else ()
    for token in (*raw, *bundled):
        if token and token.lower() not in seen:
            seen.add(token.lower())
            out.append(token)
    return out
