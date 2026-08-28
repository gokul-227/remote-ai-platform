import html
import re
import unicodedata
from abc import ABC, abstractmethod
from typing import List

from app.domains.jobs.schemas import JobPostCreate


class BaseAggregator(ABC):
    source_name: str = "UNKNOWN"

    @abstractmethod
    async def fetch_jobs(self, limit: int = 100) -> List[JobPostCreate]:
        """Fetch and normalize jobs into JobPostCreate objects."""
        pass

    def clean_text(self, text: str) -> str:
        """Strip HTML tags, unescape HTML entities, fix common mojibake, and normalize whitespace."""
        if not text:
            return ""
        # 1. Unescape HTML entities (&amp; -> &, &#39; -> ', etc.)
        unescaped = html.unescape(text)
        # 2. Fix common UTF-8 mojibake patterns
        mojibake_map = {
            "â€”": "—",
            "â€“": "–",
            "â€™": "'",
            "â€˜": "'",
            "â€œ": '"',
            "â€\x9d": '"',
            "â€\x9c": '"',
            "â€¢": "•",
            "Â": "",
        }
        for bad, good in mojibake_map.items():
            unescaped = unescaped.replace(bad, good)
        # 3. Strip HTML tags
        clean = re.sub(r"<[^>]+>", " ", unescaped)
        # 4. Normalize unicode & whitespace
        normalized = unicodedata.normalize("NFKC", clean)
        return " ".join(normalized.split())

    def extract_skills(self, text: str) -> List[str]:
        """Simple keyword matching for tech stack extraction."""
        common_tech = [
            "Python", "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Vue",
            "Go", "Golang", "Rust", "Java", "C++", "C#", ".NET", "Ruby", "Rails",
            "PostgreSQL", "MySQL", "MongoDB", "Redis", "Docker", "Kubernetes", "AWS",
            "GCP", "Azure", "GraphQL", "REST", "Tailwind", "Django", "FastAPI", "Flask",
            "PyTorch", "TensorFlow", "ML", "AI", "DevOps", "CI/CD", "Kafka"
        ]
        found = set()
        text_upper = text.upper()
        for tech in common_tech:
            if re.search(rf"\b{re.escape(tech.upper())}\b", text_upper):
                found.add(tech)
        return sorted(list(found))
