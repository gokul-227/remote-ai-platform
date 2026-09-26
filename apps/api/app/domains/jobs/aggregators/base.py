import html
import re
import unicodedata
from abc import ABC, abstractmethod

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


class BaseAggregator(ABC):
    source_name: str = "UNKNOWN"

    @abstractmethod
    async def fetch_jobs(self, limit: int = 100) -> list[JobPostCreate]:
        """Fetch and normalize jobs into JobPostCreate objects."""
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
