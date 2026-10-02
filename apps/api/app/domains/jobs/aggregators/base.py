import html
import re
import unicodedata
from abc import ABC, abstractmethod
from html.parser import HTMLParser

from app.domains.jobs.schemas import JobPostCreate

_MOJIBAKE_MARKER = re.compile("[ÃÂâ][\u0080-\u00bf\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u203a\u20ac\u2122]")
_MOJIBAKE_RUN = re.compile("(?:[\u00c2-\u00f4][\u0080-\u00bf\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u203a\u20ac\u2122]+)+")
_JOB_TYPES = {
    "fulltime": "full-time",
    "parttime": "part-time",
    "contract": "contract",
    "contractor": "contract",
    "freelance": "freelance",
    "internship": "internship",
    "temporary": "temporary",
}


_BLOCK_TAGS = {
    "p", "div", "section", "article", "header", "footer", "ul", "ol", "table", "tr",
    "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "hr",
}
_SKIP_TAGS = {"script", "style", "noscript", "template"}


class _TextWithStructure(HTMLParser):
    """HTML -> plain text that keeps paragraphs, headings and list items."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _SKIP_TAGS:
            self._skip += 1
        elif tag == "li":
            self.parts.append("\n- ")
        elif tag == "br":
            self.parts.append("\n")
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIP_TAGS:
            self._skip = max(0, self._skip - 1)
        elif tag in _BLOCK_TAGS or tag == "li":
            self.parts.append("\n\n" if tag in _BLOCK_TAGS else "\n")

    def handle_data(self, data: str) -> None:
        if not self._skip:
            self.parts.append(" ".join(data.split("\n")))


def _tidy_lines(text: str) -> str:
    """Collapse spaces within lines and blank-line runs; keep bullets together."""
    lines = [" ".join(line.split()) for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    out: list[str] = []
    for line in lines:
        if line in {"-", ""}:
            if out and out[-1] != "":
                out.append("")
            continue
        # Consecutive bullets form one list, not one paragraph each.
        if line.startswith("- ") and len(out) >= 2 and out[-1] == "" and out[-2].startswith("- "):
            out.pop()
        out.append(line)
    return "\n".join(out).strip()


class SourceFetchError(Exception):
    """The source could not be read (transport error, non-200, malformed payload).
    Distinct from a valid empty feed: a failed fetch must never expire jobs.
    The message is a redacted category (status code or exception class), never
    a response body."""


class SourceDisabledError(Exception):
    """The source is intentionally not configured (e.g. missing API key)."""


def require_list(payload: object, key: str | None = None) -> list:
    """The feed's job list, or SourceFetchError when the payload has an unexpected
    shape. A missing key is a malformed feed, not zero jobs."""
    if key is not None:
        if not isinstance(payload, dict) or key not in payload:
            raise SourceFetchError(f"payload missing '{key}'")
        payload = payload[key]
    if not isinstance(payload, list):
        raise SourceFetchError("payload is not a list")
    return payload


class BaseAggregator(ABC):
    source_name: str = "UNKNOWN"

    @abstractmethod
    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        """Fetch and normalize jobs into JobPostCreate objects. Raises
        SourceFetchError when the source cannot be read and SourceDisabledError when
        it is not configured; an empty list means the source answered with no jobs."""
        pass

    @staticmethod
    def repair_mojibake(text: str) -> str:
        """Undo UTF-8 text that was decoded as Latin-1/CP1252 ("MecÃ¡nico" -> "Mecánico")."""
        if not _MOJIBAKE_MARKER.search(text):
            return text
        for codec in ("cp1252", "latin-1"):
            try:
                repaired = text.encode(codec).decode("utf-8")
            except UnicodeError:
                continue
            if len(_MOJIBAKE_MARKER.findall(repaired)) < len(_MOJIBAKE_MARKER.findall(text)):
                return repaired
        # Mixed text: repair each garbled run on its own.
        def _run(m: re.Match[str]) -> str:
            chunk = m.group(0)
            for codec in ("cp1252", "latin-1"):
                try:
                    return chunk.encode(codec).decode("utf-8")
                except UnicodeError:
                    continue
            return chunk

        text = _MOJIBAKE_RUN.sub(_run, text)
        # Already-stored text where an earlier NFKC pass turned the second byte
        # of "ó"/"ò"/"ù" (³ ² ¹) into a digit: "DiagnÃ3stico".
        return text.replace("Ã3", "ó").replace("Ã2", "ò").replace("Ã1", "ù").replace("Â", "")

    @classmethod
    def clean_text(cls, text: str | None = None) -> str:
        """Repair mojibake, unescape HTML entities, strip tags and normalize whitespace."""
        if not text:
            return ""
        repaired = cls.repair_mojibake(html.unescape(cls.repair_mojibake(text)))
        clean = re.sub(r"<[^>]+>", " ", repaired)
        # NFC, not NFKC: NFKC rewrites characters such as "³" to "3", which
        # corrupts text and hides mojibake from later repair.
        normalized = unicodedata.normalize("NFC", clean)
        return " ".join(normalized.split())

    @classmethod
    def clean_rich_text(cls, text: str | None = None) -> str:
        """Like clean_text, but keeps paragraphs, headings and bullet lists as
        lines (plain text only; no markup survives). Used for descriptions."""
        if not text or not text.strip():
            return ""
        repaired = cls.repair_mojibake(text)
        if re.search(r"<[a-zA-Z/!][^>]*>", repaired):
            parser = _TextWithStructure()
            parser.feed(repaired)
            parser.close()
            body = "".join(parser.parts)
        else:
            body = html.unescape(repaired)
        return unicodedata.normalize("NFC", _tidy_lines(cls.repair_mojibake(body)))

    @staticmethod
    def normalize_job_type(value: str | None) -> str:
        """One spelling per type; anything the source doesn't state is "unspecified"."""
        key = re.sub(r"[\s_-]+", "", (value or "").lower())
        return _JOB_TYPES.get(key, "unspecified")

    def extract_skills(self, text: str) -> list[str]:
        """Simple keyword matching for tech stack extraction."""
        common_tech = [
            "Python",
            "JavaScript",
            "TypeScript",
            "React",
            "Next.js",
            "Node.js",
            "Vue",
            "Go",
            "Golang",
            "Rust",
            "Java",
            "C++",
            "C#",
            ".NET",
            "Ruby",
            "Rails",
            "PostgreSQL",
            "MySQL",
            "MongoDB",
            "Redis",
            "Docker",
            "Kubernetes",
            "AWS",
            "GCP",
            "Azure",
            "GraphQL",
            "REST",
            "Tailwind",
            "Django",
            "FastAPI",
            "Flask",
            "PyTorch",
            "TensorFlow",
            "ML",
            "AI",
            "DevOps",
            "CI/CD",
            "Kafka",
        ]
        found = set()
        text_upper = text.upper()
        for tech in common_tech:
            if re.search(rf"\b{re.escape(tech.upper())}\b", text_upper):
                found.add(tech)
        return sorted(found)
