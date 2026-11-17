"""Recognise company career boards of the supported ATSes in links.

``extract_boards(text)`` returns ``{(SOURCE, token)}`` for every ATS career-site
URL in the text (apply links, descriptions, public lists). It only reads what is
already in hand; nothing is fetched here. Tokens are the same ones the importers
use (``boards/*.txt``).
"""

from __future__ import annotations

import re

# Hosts we recognise (fast prefilter before any regex work).
_HOST_HINTS = (
    "greenhouse.io",
    "lever.co",
    "ashbyhq.com",
    "smartrecruiters.com",
    "workable.com",
    "recruitee.com",
    "personio.de",
    "personio.com",
    "teamtailor.com",
    "bamboohr.com",
    "breezy.hr",
)
_URL = re.compile(r"https?://[^\s\"'<>()\[\]{}|\\^`]+", re.I)
_TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")

# Subdomains / path segments that are the ATS itself, never a company.
_RESERVED = {
    "www", "app", "api", "apply", "jobs", "careers", "career", "blog", "help", "support",
    "docs", "status", "assets", "static", "cdn", "partners", "partner", "marketplace",
    "developer", "developers", "resources", "attachments", "embed", "boards", "v0", "v1",
    "job_board", "job_app", "j", "o", "ni", "oneclick-ui", "sr-jobs", "login", "signup",
    "en", "de", "fr", "es", "search", "company", "companies", "posting-api", "postings",
}

# (source, compiled pattern, case_sensitive). Group 1 is the token.
_PATTERNS: list[tuple[str, re.Pattern[str], bool]] = [
    (
        "GREENHOUSE",
        re.compile(
            r"^https?://(?:boards|job-boards)\.greenhouse\.io/(?:embed/job_(?:board|app)\?(?:[^#]*[&;])?for=)?([\w.-]+)",
            re.I,
        ),
        False,
    ),
    ("GREENHOUSE", re.compile(r"^https?://boards-api\.greenhouse\.io/v1/boards/([\w.-]+)", re.I), False),
    ("LEVER", re.compile(r"^https?://jobs\.lever\.co/([\w.-]+)", re.I), False),
    ("LEVER", re.compile(r"^https?://api\.lever\.co/v0/postings/([\w.-]+)", re.I), False),
    ("ASHBY", re.compile(r"^https?://jobs\.ashbyhq\.com/([\w.-]+)", re.I), True),
    (
        "SMARTRECRUITERS",
        re.compile(r"^https?://(?:jobs|careers)\.smartrecruiters\.com/([\w.-]+)", re.I),
        True,
    ),
    ("WORKABLE", re.compile(r"^https?://apply\.workable\.com/([\w.-]+)", re.I), False),
    ("WORKABLE", re.compile(r"^https?://([a-z0-9-]+)\.workable\.com", re.I), False),
    ("RECRUITEE", re.compile(r"^https?://([a-z0-9-]+)\.recruitee\.com", re.I), False),
    ("PERSONIO", re.compile(r"^https?://([a-z0-9-]+)\.jobs\.personio\.(?:de|com)", re.I), False),
    ("TEAMTAILOR", re.compile(r"^https?://([a-z0-9-]+)\.teamtailor\.com", re.I), False),
    ("BAMBOOHR", re.compile(r"^https?://([a-z0-9-]+)\.bamboohr\.com", re.I), False),
    ("BREEZY", re.compile(r"^https?://([a-z0-9-]+)\.breezy\.hr", re.I), False),
]

CASE_SENSITIVE = {source for source, _, sensitive in _PATTERNS if sensitive}


def board_from_url(url: str) -> tuple[str, str] | None:
    """(SOURCE, token) for one ATS career-site URL, else None."""
    for source, pattern, sensitive in _PATTERNS:
        m = pattern.match(url)
        if not m:
            continue
        token = m.group(1).rstrip(".")
        if not _TOKEN.match(token) or token.lower() in _RESERVED:
            return None
        return source, token if sensitive else token.lower()
    return None


def extract_boards(*texts: str | None) -> set[tuple[str, str]]:
    """Every supported ATS board linked from the given texts."""
    found: set[tuple[str, str]] = set()
    for text in texts:
        if not text:
            continue
        low = text.lower()
        if not any(h in low for h in _HOST_HINTS):
            continue
        for m in _URL.finditer(text):
            hit = board_from_url(m.group(0))
            if hit:
                found.add(hit)
    return found
