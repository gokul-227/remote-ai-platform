"""
Base Abstract Aggregator interface for external job sources.
"""

from abc import ABC, abstractmethod
from typing import List
import re

from app.domains.jobs.schemas import JobPostCreate


class BaseAggregator(ABC):
    source_name: str = "UNKNOWN"

    @abstractmethod
    async def fetch_jobs(self, limit: int = 100) -> List[JobPostCreate]:
        """Fetch and normalize jobs into JobPostCreate objects."""
        pass

    def clean_text(self, text: str) -> str:
        """Strip HTML tags and normalize whitespace."""
        if not text:
            return ""
        clean = re.sub(r"<[^>]+>", " ", text)
        return " ".join(clean.split())

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
