"""Structured filter fields for a job posting (job search filters).

`derive_fields(job)` returns the filter columns of one posting: workplace type,
employment type, seniority, salary, country/region, timezone band, industry,
job function, visa sponsorship and posting language.

Rules, in order: a value the source states in a structured field always wins;
otherwise a conservative text heuristic over the title, location and (for a
few fields) the description; otherwise the field stays None ("unknown"). A
heuristic only fires on explicit wording, never on a guess: a posting that
does not say it is senior is not "mid-senior", a posting without a stated
salary has no salary. The same function backfills stored rows
(`app.domains.jobs.backfill`), so imports and backfill agree.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# Bump when the rules change: the backfill task re-derives rows with an older version.
DERIVE_VERSION = 1

WORKPLACE_TYPES = ("remote", "hybrid", "onsite")
SENIORITY_LEVELS = ("internship", "entry", "associate", "mid_senior", "director", "executive")
EMPLOYMENT_TYPES = (
    "full-time",
    "part-time",
    "contract",
    "temporary",
    "internship",
    "volunteer",
    "freelance",
)
REGIONS = ("worldwide", "north_america", "latam", "europe", "africa", "middle_east", "apac")
INDUSTRIES = (
    "software_it",
    "finance",
    "healthcare",
    "education",
    "ecommerce_retail",
    "marketing_advertising",
    "media_entertainment",
    "gaming",
    "crypto_web3",
    "government",
    "nonprofit",
    "consulting",
    "logistics",
    "travel_hospitality",
    "energy",
    "telecom",
    "real_estate",
    "legal",
    "manufacturing",
)
JOB_FUNCTIONS = (
    "engineering",
    "data",
    "design",
    "product",
    "marketing",
    "sales",
    "customer_support",
    "operations",
    "finance_accounting",
    "hr_recruiting",
    "legal",
    "writing_content",
    "education",
    "healthcare",
    "project_management",
)
LANGUAGES = ("en", "de", "fr", "es", "pt", "nl", "it", "pl")
SALARY_PERIODS = ("hour", "day", "week", "month", "year", "project")

# ── location ────────────────────────────────────────────────────────────────

# ISO 3166-1 alpha-2 -> (region, (utc_min, utc_max) whole hours, standard time)
COUNTRIES: dict[str, tuple[str, tuple[int, int]]] = {
    "US": ("north_america", (-10, -5)),
    "CA": ("north_america", (-8, -3)),
    "MX": ("latam", (-8, -6)),
    "BR": ("latam", (-5, -3)),
    "AR": ("latam", (-3, -3)),
    "CL": ("latam", (-4, -3)),
    "CO": ("latam", (-5, -5)),
    "PE": ("latam", (-5, -5)),
    "UY": ("latam", (-3, -3)),
    "CR": ("latam", (-6, -6)),
    "GB": ("europe", (0, 0)),
    "IE": ("europe", (0, 0)),
    "PT": ("europe", (0, 0)),
    "ES": ("europe", (1, 1)),
    "FR": ("europe", (1, 1)),
    "DE": ("europe", (1, 1)),
    "NL": ("europe", (1, 1)),
    "BE": ("europe", (1, 1)),
    "CH": ("europe", (1, 1)),
    "AT": ("europe", (1, 1)),
    "IT": ("europe", (1, 1)),
    "PL": ("europe", (1, 1)),
    "CZ": ("europe", (1, 1)),
    "SE": ("europe", (1, 1)),
    "NO": ("europe", (1, 1)),
    "DK": ("europe", (1, 1)),
    "FI": ("europe", (2, 2)),
    "EE": ("europe", (2, 2)),
    "RO": ("europe", (2, 2)),
    "GR": ("europe", (2, 2)),
    "UA": ("europe", (2, 2)),
    "HU": ("europe", (1, 1)),
    "RS": ("europe", (1, 1)),
    "HR": ("europe", (1, 1)),
    "BG": ("europe", (2, 2)),
    "LT": ("europe", (2, 2)),
    "LV": ("europe", (2, 2)),
    "TR": ("europe", (3, 3)),
    "IL": ("middle_east", (2, 2)),
    "AE": ("middle_east", (4, 4)),
    "SA": ("middle_east", (3, 3)),
    "EG": ("africa", (2, 2)),
    "ZA": ("africa", (2, 2)),
    "NG": ("africa", (1, 1)),
    "KE": ("africa", (3, 3)),
    "IN": ("apac", (5, 6)),
    "PK": ("apac", (5, 5)),
    "SG": ("apac", (8, 8)),
    "PH": ("apac", (8, 8)),
    "MY": ("apac", (8, 8)),
    "ID": ("apac", (7, 9)),
    "VN": ("apac", (7, 7)),
    "TH": ("apac", (7, 7)),
    "CN": ("apac", (8, 8)),
    "HK": ("apac", (8, 8)),
    "TW": ("apac", (8, 8)),
    "JP": ("apac", (9, 9)),
    "KR": ("apac", (9, 9)),
    "AU": ("apac", (8, 10)),
    "NZ": ("apac", (12, 12)),
}

_COUNTRY_NAMES: dict[str, str] = {
    "united states": "US", "united states of america": "US", "usa": "US", "u.s.": "US",
    "u.s.a.": "US", "america": "US", "canada": "CA", "mexico": "MX", "brazil": "BR",
    "brasil": "BR", "argentina": "AR", "chile": "CL", "colombia": "CO", "peru": "PE",
    "uruguay": "UY", "costa rica": "CR", "united kingdom": "GB", "uk": "GB", "u.k.": "GB",
    "england": "GB", "scotland": "GB", "wales": "GB", "great britain": "GB", "ireland": "IE",
    "portugal": "PT", "spain": "ES", "españa": "ES", "france": "FR", "germany": "DE",
    "deutschland": "DE", "netherlands": "NL", "the netherlands": "NL", "holland": "NL",
    "belgium": "BE", "switzerland": "CH", "schweiz": "CH", "austria": "AT", "österreich": "AT",
    "italy": "IT", "italia": "IT", "poland": "PL", "polska": "PL", "czech republic": "CZ",
    "czechia": "CZ", "sweden": "SE", "norway": "NO", "denmark": "DK", "finland": "FI",
    "estonia": "EE", "romania": "RO", "greece": "GR", "ukraine": "UA", "hungary": "HU",
    "serbia": "RS", "croatia": "HR", "bulgaria": "BG", "lithuania": "LT", "latvia": "LV",
    "turkey": "TR", "türkiye": "TR", "israel": "IL", "united arab emirates": "AE", "uae": "AE",
    "saudi arabia": "SA", "egypt": "EG", "south africa": "ZA", "nigeria": "NG", "kenya": "KE",
    "india": "IN", "pakistan": "PK", "singapore": "SG", "philippines": "PH", "malaysia": "MY",
    "indonesia": "ID", "vietnam": "VN", "thailand": "TH", "china": "CN", "hong kong": "HK",
    "taiwan": "TW", "japan": "JP", "south korea": "KR", "korea": "KR", "australia": "AU",
    "new zealand": "NZ",
}  # fmt: skip

_CITIES: dict[str, str] = {
    "new york": "US", "nyc": "US", "san francisco": "US", "los angeles": "US", "seattle": "US",
    "austin": "US", "boston": "US", "chicago": "US", "denver": "US", "atlanta": "US",
    "miami": "US", "washington, dc": "US", "toronto": "CA", "vancouver": "CA",
    "montreal": "CA", "london": "GB", "manchester": "GB", "edinburgh": "GB", "dublin": "IE",
    "lisbon": "PT", "madrid": "ES", "barcelona": "ES", "paris": "FR", "berlin": "DE",
    "munich": "DE", "münchen": "DE", "hamburg": "DE", "frankfurt": "DE", "cologne": "DE",
    "köln": "DE", "amsterdam": "NL", "rotterdam": "NL", "brussels": "BE", "zurich": "CH",
    "zürich": "CH", "vienna": "AT", "wien": "AT", "milan": "IT", "rome": "IT", "warsaw": "PL",
    "krakow": "PL", "kraków": "PL", "prague": "CZ", "stockholm": "SE", "oslo": "NO",
    "copenhagen": "DK", "helsinki": "FI", "tallinn": "EE", "bucharest": "RO", "athens": "GR",
    "kyiv": "UA", "budapest": "HU", "istanbul": "TR", "tel aviv": "IL", "dubai": "AE",
    "cape town": "ZA", "lagos": "NG", "nairobi": "KE", "bangalore": "IN", "bengaluru": "IN",
    "mumbai": "IN", "delhi": "IN", "hyderabad": "IN", "pune": "IN", "chennai": "IN",
    "tokyo": "JP", "seoul": "KR", "sydney": "AU", "melbourne": "AU", "auckland": "NZ",
    "são paulo": "BR", "sao paulo": "BR", "buenos aires": "AR", "mexico city": "MX",
    "bogotá": "CO", "bogota": "CO", "santiago": "CL", "manila": "PH", "jakarta": "ID",
    "kuala lumpur": "MY", "bangkok": "TH", "shanghai": "CN", "beijing": "CN",
}  # fmt: skip

_US_STATES = frozenset(
    "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH "
    "NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split()
)
_REGION_WORDS: tuple[tuple[str, str], ...] = (
    (r"\b(worldwide|anywhere|global(ly)?|any location|work from anywhere)\b", "worldwide"),
    (r"\b(latam|latin america|south america|central america)\b", "latam"),
    (r"\b(north america|americas?)\b", "north_america"),
    (r"\b(europe|european union|eu|eea|emea|cet|cest)\b", "europe"),
    (r"\b(apac|asia[- ]pacific|asia|oceania)\b", "apac"),
    (r"\b(middle east|mena|gcc)\b", "middle_east"),
    (r"\bafrica\b", "africa"),
)
_REGION_TZ: dict[str, tuple[int, int]] = {
    "north_america": (-10, -3),
    "latam": (-8, -3),
    "europe": (0, 3),
    "africa": (0, 3),
    "middle_east": (2, 4),
    "apac": (5, 12),
}
_TZ_ABBR: dict[str, int] = {
    "pst": -8, "pdt": -8, "pt": -8, "mst": -7, "mt": -7, "cst": -6, "ct": -6, "est": -5,
    "edt": -5, "et": -5, "gmt": 0, "bst": 0, "wet": 0, "cet": 1, "cest": 1, "eet": 2,
    "ist": 5, "sgt": 8, "jst": 9, "aest": 10,
}  # fmt: skip


@dataclass
class Derived:
    workplace_type: str | None = None
    job_type: str | None = None
    seniority: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    salary_period: str | None = None
    currency: str | None = None
    country_code: str | None = None
    region: str | None = None
    tz_min: int | None = None
    tz_max: int | None = None
    industry: str | None = None
    job_function: str | None = None
    visa_sponsorship: bool | None = None
    language: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


def _norm(text: str | None) -> str:
    return " ".join((text or "").lower().split())


def _has(pattern: str, text: str) -> bool:
    return re.search(pattern, text, re.IGNORECASE) is not None


# ── workplace / employment / seniority ──────────────────────────────────────


def workplace_type(location: str | None, title: str, is_remote: bool | None) -> str | None:
    """Location/title wording first (hybrid beats remote: "Remote or hybrid, Berlin"
    is hybrid), then the source's remote flag."""
    text = f"{_norm(location)} | {_norm(title)}"
    if _has(r"\bhybrid\b", text):
        return "hybrid"
    if _has(r"\b(on[- ]?site|in[- ]office|office[- ]based)\b", text):
        return "onsite"
    if _has(r"\b(remote|anywhere|worldwide|work from home|wfh|telecommute|distributed)\b", text):
        return "remote"
    if is_remote is True:
        return "remote"
    if is_remote is False:
        return "onsite"
    return None


def employment_type(job_type: str | None, title: str) -> str | None:
    """The source's stated type; otherwise only explicit wording in the title."""
    if job_type and job_type in EMPLOYMENT_TYPES:
        return job_type
    t = _norm(title)
    for pattern, value in (
        (r"\bintern(ship)?\b|\bpraktikum\b|\bstagiaire?\b", "internship"),
        (r"\bvolunteer\b", "volunteer"),
        (r"\bfreelance(r)?\b", "freelance"),
        (r"\bpart[- ]time\b|\bteilzeit\b", "part-time"),
        (r"\b(contract(or)?|c2c|1099)\b", "contract"),
        (r"\b(temporary|temp|seasonal|fixed[- ]term)\b", "temporary"),
        (r"\bfull[- ]time\b|\bvollzeit\b", "full-time"),
    ):
        if _has(pattern, t):
            return value
    return None


_LEGACY_LEVELS = {
    "intern": "internship",
    "internship": "internship",
    "junior": "entry",
    "entry": "entry",
    "entry-level": "entry",
    "associate": "associate",
    "mid": "mid_senior",
    "senior": "mid_senior",
    "lead": "mid_senior",
    "mid_senior": "mid_senior",
    "director": "director",
    "executive": "executive",
}


def seniority(experience_level: str | None, title: str) -> str | None:
    if experience_level and experience_level.lower() in _LEGACY_LEVELS:
        return _LEGACY_LEVELS[experience_level.lower()]
    t = _norm(title)
    for pattern, value in (
        (r"\b(chief|cto|ceo|cfo|coo|cmo|cpo|ciso|vp|svp|evp|vice president|president)\b", "executive"),
        (r"\b(director|head of)\b", "director"),
        (r"\b(intern|internship|trainee|apprentice|werkstudent)\b", "internship"),
        (r"\b(junior|jr\.?|entry[- ]level|graduate|new grad|associate level)\b", "entry"),
        (r"\b(senior|sr\.?|staff|principal|lead|manager|architect|expert)\b", "mid_senior"),
        (r"\bassociate\b", "associate"),
    ):
        if _has(pattern, t):
            return value
    return None


# ── salary ──────────────────────────────────────────────────────────────────

_CURRENCY_SYMBOLS = {"$": "USD", "us$": "USD", "€": "EUR", "£": "GBP", "₹": "INR", "c$": "CAD", "a$": "AUD"}
_ISO = r"USD|EUR|GBP|CAD|AUD|CHF|INR|SEK|NOK|DKK|PLN|BRL|SGD|NZD|JPY|MXN"
_AMOUNT = r"\d{1,3}(?:[.,\s]\d{3})+|\d+(?:\.\d+)?\s*[kK]?|\d+"
_SALARY_RE = re.compile(
    rf"(?P<cur>(?:US\$|C\$|A\$|[$€£₹])|(?:\b(?:{_ISO})\b\s?))\s?(?P<lo>{_AMOUNT})"
    rf"(?:\s*(?:-|–|—|to)\s*(?:(?:US\$|C\$|A\$|[$€£₹])|(?:\b(?:{_ISO})\b\s?))?\s?(?P<hi>{_AMOUNT}))?"
    r"(?P<tail>[^.\n]{0,40})",
    re.IGNORECASE,
)


def _amount(raw: str) -> float | None:
    s = raw.strip().lower().replace(" ", "")
    mult = 1000.0 if s.endswith("k") else 1.0
    s = s.rstrip("k")
    if re.fullmatch(r"\d{1,3}([.,]\d{3})+", s):
        s = re.sub(r"[.,]", "", s)
    try:
        return float(s) * mult
    except ValueError:
        return None


def _period(tail: str, lo: float) -> str | None:
    t = tail.lower()
    if _has(r"(/\s*h(ou)?r|per hour|an hour|hourly|/h\b)", t):
        return "hour"
    if _has(r"(/\s*day|per day|a day|daily)", t):
        return "day"
    if _has(r"(/\s*week|per week|a week|weekly)", t):
        return "week"
    if _has(r"(/\s*mo(nth)?|per month|a month|monthly)", t):
        return "month"
    if _has(r"(/\s*y(ea)?r|per year|a year|annual|annum|p\.a\.|yearly|base salary)", t):
        return "year"
    return "year" if lo >= 10_000 else None


def salary_from_text(text: str) -> tuple[float, float, str, str] | None:
    """(min, max, currency, period) only for an explicit amount with a currency and
    a plausible range; `$5` or `401k` never counts."""
    for m in _SALARY_RE.finditer(text[:6000]):
        cur_raw = m.group("cur").strip().lower()
        currency = _CURRENCY_SYMBOLS.get(cur_raw) or cur_raw.upper()
        lo = _amount(m.group("lo"))
        hi = _amount(m.group("hi")) if m.group("hi") else lo
        if lo is None or hi is None or lo <= 0:
            continue
        if hi < lo:
            lo, hi = hi, lo
        period = _period(m.group("tail") or "", lo)
        if period is None:
            continue
        bounds = {"hour": (5, 1000), "day": (40, 5000), "week": (200, 20_000),
                  "month": (500, 100_000), "year": (10_000, 2_000_000)}[period]  # fmt: skip
        if not (bounds[0] <= lo <= bounds[1] and hi <= bounds[1] and hi <= lo * 4):
            continue
        return lo, hi, currency[:3], period
    return None


# ── location / timezone ─────────────────────────────────────────────────────


def country_region(location: str | None) -> tuple[str | None, str | None]:
    """(ISO country, region). A location naming several countries keeps only the
    region they share (or none); "Remote - Worldwide" is region "worldwide"."""
    loc = _norm(location)
    if not loc or loc in {"not specified", "remote", "n/a"}:
        return None, None
    found: list[str] = []
    for part in re.split(r"[;|/•]| or |\band\b", loc):
        part = part.strip(" -,()")
        if not part:
            continue
        code = None
        for name, iso in sorted(_COUNTRY_NAMES.items(), key=lambda kv: -len(kv[0])):
            if re.search(rf"(^|[\s,(\-]){re.escape(name)}($|[\s,)\-])", part):
                code = iso
                break
        if code is None:
            for city, iso in _CITIES.items():
                if re.search(rf"(^|[\s,(\-]){re.escape(city)}($|[\s,)\-])", part):
                    code = iso
                    break
        if code is None:
            m = re.search(r",\s*([a-z]{2})\b", part)
            if m and m.group(1).upper() in _US_STATES:
                code = "US"
        if code:
            found.append(code)
    codes = sorted(set(found))
    if len(codes) == 1:
        return codes[0], COUNTRIES[codes[0]][0]
    if codes:
        regions = {COUNTRIES[c][0] for c in codes}
        return None, regions.pop() if len(regions) == 1 else None
    for pattern, region in _REGION_WORDS:
        if _has(pattern, loc):
            return None, region
    return None, None


_UTC_RE = re.compile(r"\b(?:utc|gmt)\s*([+\-−]\s*\d{1,2})(?::?\d{2})?", re.IGNORECASE)


def timezone_band(
    text: str, country: str | None, region: str | None
) -> tuple[int | None, int | None]:
    """UTC offsets the posting names ("UTC-5 to UTC+1", "EST", "CET"), else the
    country's or region's span. Worldwide/unknown stays None (no constraint known)."""
    offsets = [int(x.replace("−", "-").replace(" ", "")) for x in _UTC_RE.findall(text[:4000])]
    if not offsets:
        for abbr in re.findall(r"\b([A-Z]{2,4})\b", text[:4000]):
            if abbr.lower() in _TZ_ABBR and abbr not in {"IST", "ET", "PT", "CT", "MT"}:
                offsets.append(_TZ_ABBR[abbr.lower()])
            elif abbr in {"ET", "PT", "CT", "MT"} and re.search(rf"\b{abbr}\b\s*(time|zone|hours)", text):
                offsets.append(_TZ_ABBR[abbr.lower()])
    offsets = [o for o in offsets if -12 <= o <= 14]
    if offsets:
        return min(offsets), max(offsets)
    if country:
        return COUNTRIES[country][1]
    if region and region in _REGION_TZ:
        return _REGION_TZ[region]
    return None, None


# ── industry / function / visa / language ───────────────────────────────────

_INDUSTRY_WORDS: dict[str, str] = {
    "finance": r"fintech|banking|\bbank\b|payments?|insurance|insurtech|lending|investment|trading|wealth",
    "healthcare": r"health ?care|healthtech|medical|clinical|hospital|patients?|pharma|biotech|telehealth",
    "education": r"edtech|education(al)?|learning platform|students?|universit(y|ies)|schools?|e-learning",
    "ecommerce_retail": r"e-?commerce|retail|marketplace|shopify|online store|consumer goods",
    "marketing_advertising": r"adtech|advertising|marketing agency|martech",
    "media_entertainment": r"media company|entertainment|streaming|publishing|newsroom|music|film",
    "gaming": r"\bgames?\b|gaming|game studio|esports",
    "crypto_web3": r"crypto|blockchain|web3|defi|\bnft\b|ethereum|bitcoin",
    "government": r"government|federal agency|public sector|\bagency of\b",
    "nonprofit": r"non-?profit|charity|ngo|foundation\b",
    "consulting": r"consultancy|consulting firm|professional services|agency clients",
    "logistics": r"logistics|supply chain|freight|shipping|fleet",
    "travel_hospitality": r"travel|hospitality|hotels?|tourism|airline",
    "energy": r"energy|renewables?|solar|climate tech|cleantech|oil and gas|utilities",
    "telecom": r"telecom|telecommunications|5g|network operator",
    "real_estate": r"real estate|proptech|property management",
    "legal": r"legal ?tech|law firm",
    "manufacturing": r"manufacturing|industrial|factory|hardware",
    "software_it": r"\bsaas\b|software company|cloud platform|developer tools|b2b software|it services",
}
_SOURCE_INDUSTRY = {"USAJOBS": "government"}


def industry(source: str | None, company: str, description: str) -> str | None:
    if source and source.upper() in _SOURCE_INDUSTRY:
        return _SOURCE_INDUSTRY[source.upper()]
    text = f"{company} {description[:2500]}".lower()
    best, hits = None, 0
    for name, pattern in _INDUSTRY_WORDS.items():
        n = len(re.findall(rf"\b(?:{pattern})", text))
        if n > hits:
            best, hits = name, n
    return best if hits >= 2 else None


_FUNCTION_WORDS: tuple[tuple[str, str], ...] = (
    ("data", r"data (scientist|analyst|engineer)|machine learning|\bml\b|\bai engineer|analytics|\bbi\b"),
    ("design", r"designer|\bux\b|\bui\b|user research|illustrator|creative director"),
    ("product", r"product (manager|owner|lead|director)|\bpm\b"),
    ("project_management", r"project manager|program manager|scrum master|delivery manager"),
    ("engineering", r"engineer|developer|devops|\bsre\b|programmer|architect|qa|tester|software|full[- ]?stack|front[- ]?end|back[- ]?end"),
    ("marketing", r"marketing|seo|growth|brand|social media|community manager|demand gen"),
    ("sales", r"sales|account executive|business development|\bsdr\b|\bbdr\b|account manager"),
    ("customer_support", r"support|customer success|customer service|help ?desk|customer experience"),
    ("finance_accounting", r"accountant|accounting|finance|controller|bookkeep|payroll|financial analyst|tax"),
    ("hr_recruiting", r"recruit|talent acquisition|\bhr\b|human resources|people (partner|ops)"),
    ("legal", r"counsel|lawyer|attorney|paralegal|legal|compliance"),
    ("writing_content", r"writer|editor|copywrit|content|journalist|translator"),
    ("education", r"teacher|tutor|instructor|lecturer|professor|curriculum"),
    ("healthcare", r"nurse|physician|doctor|therapist|clinician|pharmacist|medical"),
    ("operations", r"operations|ops manager|administrator|assistant|coordinator|office manager"),
)  # fmt: skip


def job_function(title: str) -> str | None:
    t = _norm(title)
    for name, pattern in _FUNCTION_WORDS:
        if _has(pattern, t):
            return name
    return None


_VISA_NO = (
    r"(no|not|unable to|cannot|can't|can ?not|won't|will not|does not|do not|don't)\s+"
    r"(offer|provide|sponsor|support)[a-z]*\s*(any\s+)?(visa|work permit|sponsorship)"
    r"|without (visa )?sponsorship|sponsorship (is )?not (available|offered|provided)"
    r"|no (visa )?sponsorship|must (already )?(be )?(legally )?authori[sz]ed to work"
    r"|must have (the )?(right|authori[sz]ation) to work"
)
_VISA_YES = (
    r"visa sponsorship (is )?(available|provided|offered|possible)|(will|can|we) sponsor"
    r"|sponsorship (is )?(available|provided|offered)|relocation and visa|visa support"
    r"|offer(s)? visa sponsorship|provide(s)? visa sponsorship"
)


def visa_sponsorship(description: str) -> bool | None:
    text = _norm(description)
    if _has(_VISA_NO, text):
        return False
    if _has(_VISA_YES, text):
        return True
    return None


_STOPWORDS: dict[str, frozenset[str]] = {
    "en": frozenset("the and you with for our are will your this that have from about we".split()),
    "de": frozenset("und der die das mit für wir sie ist eine ein auf bei unsere oder".split()),
    "fr": frozenset("et les des pour vous avec une nous est dans sur sont votre notre".split()),
    "es": frozenset("y los las para con una por del que es nuestro somos tu sus como".split()),
    "pt": frozenset("e os as para com uma por do da que é nosso você seu são não".split()),
    "nl": frozenset("en de het een van voor met wij jij je ons onze bij zijn".split()),
    "it": frozenset("e il la per con una di che è sono nostro nostra gli del della".split()),
    "pl": frozenset("i w z na do się jest dla oraz nasz nasze jako lub być".split()),
}


def language(title: str, description: str) -> str | None:
    words = re.findall(r"[^\W\d_]+", f"{title} {description[:1500]}".lower())
    if len(words) < 8:
        return None
    scores = {lang: sum(w in sw for w in words) for lang, sw in _STOPWORDS.items()}
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    (top, n1), (_, n2) = ranked[0], ranked[1]
    if n1 >= 4 and n1 >= 1.5 * max(n2, 1):
        return top
    return None


# ── entry point ─────────────────────────────────────────────────────────────


def derive_fields(
    *,
    title: str,
    description: str,
    company_name: str | None,
    location: str | None,
    is_remote: bool | None,
    job_type: str | None,
    experience_level: str | None,
    salary_min: float | None,
    salary_max: float | None,
    salary_period: str | None,
    currency: str | None,
    source: str | None,
    stated: dict[str, Any] | None = None,
) -> Derived:
    """Filter fields for one posting; `stated` holds structured values a source
    gave directly (they win over every heuristic)."""
    stated = {k: v for k, v in (stated or {}).items() if v is not None}
    d = Derived()
    d.workplace_type = stated.get("workplace_type") or workplace_type(location, title, is_remote)
    d.job_type = employment_type(job_type, title)
    d.seniority = stated.get("seniority") or seniority(experience_level, title)
    if salary_min is not None or salary_max is not None:
        d.salary_min, d.salary_max = salary_min, salary_max
        d.salary_period, d.currency = salary_period, currency
    else:
        parsed = salary_from_text(description)
        if parsed:
            d.salary_min, d.salary_max, d.currency, d.salary_period = parsed
    if stated.get("country_code"):
        d.country_code = str(stated["country_code"]).upper()
        d.region = COUNTRIES.get(d.country_code, (None, None))[0]
    else:
        d.country_code, d.region = country_region(location)
    if d.workplace_type == "remote" and d.country_code is None and d.region is None and _has(
        r"\b(remote|anywhere)\b", _norm(location)
    ) and not _has(r"\b(us|usa|uk|eu|only)\b", _norm(location)):
        # "Remote" with no place at all: open worldwide as far as the posting says.
        d.region = "worldwide" if _has(r"worldwide|anywhere|global", _norm(location)) else None
    d.tz_min, d.tz_max = timezone_band(f"{location or ''} {description}", d.country_code, d.region)
    d.industry = stated.get("industry") or industry(source, company_name or "", description)
    d.job_function = stated.get("job_function") or job_function(title)
    d.visa_sponsorship = (
        stated["visa_sponsorship"] if "visa_sponsorship" in stated else visa_sponsorship(description)
    )
    d.language = stated.get("language") or language(title, description)
    return d


def filter_columns(d: Derived) -> dict[str, Any]:
    """The columns `derive_fields` owns on job_posts (salary/job_type handled by caller)."""
    return {
        "workplace_type": d.workplace_type,
        "seniority": d.seniority,
        "country_code": d.country_code,
        "region": d.region,
        "tz_min": d.tz_min,
        "tz_max": d.tz_max,
        "industry": d.industry,
        "job_function": d.job_function,
        "visa_sponsorship": d.visa_sponsorship,
        "language": d.language,
    }


def derive_for_create(job: Any) -> dict[str, Any]:
    """Updates for a JobPostCreate (imports and posted jobs): every filter column
    plus salary/job_type when the source left them empty."""
    d = derive_fields(
        title=job.title,
        description=job.description,
        company_name=job.company_name,
        location=job.location,
        is_remote=job.is_remote,
        job_type=None if job.job_type == "unspecified" else job.job_type,
        experience_level=job.experience_level,
        salary_min=job.salary_min,
        salary_max=job.salary_max,
        salary_period=job.salary_period,
        currency=job.currency,
        source=job.source,
        stated={k: getattr(job, k, None) for k in STATED_FIELDS},
    )
    out = filter_columns(d)
    out["job_type"] = d.job_type or "unspecified"
    if job.salary_min is None and job.salary_max is None and d.salary_min is not None:
        out.update(
            salary_min=d.salary_min,
            salary_max=d.salary_max,
            salary_period=d.salary_period,
            currency=d.currency or job.currency,
        )
    return out


STATED_FIELDS = (
    "workplace_type",
    "seniority",
    "country_code",
    "industry",
    "job_function",
    "visa_sponsorship",
    "language",
)
