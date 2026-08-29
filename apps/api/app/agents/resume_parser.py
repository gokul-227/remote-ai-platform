"""
AI Resume Parser Agent.
"""

from typing import Any

from app.core.logging import get_logger
from app.services.ai import AIService

logger = get_logger("agents.resume_parser")

SYSTEM_PROMPT = """
You are an expert HR AI Resume Parser for software engineering profiles.
Given raw text from a software engineer's resume, extract and return a clean, strictly formatted JSON object with the following schema:

{
  "headline": "Short professional headline e.g. Senior Full Stack Engineer (Python/React)",
  "bio": "2-3 sentence executive summary of candidate background and strengths",
  "years_of_experience": 5,
  "primary_role": "Full-Stack Engineer",
  "skills": ["Python", "FastAPI", "React", "PostgreSQL", "Docker"],
  "experience": [
    {
      "company": "Tech Corp",
      "title": "Senior Engineer",
      "start_date": "2021-01",
      "end_date": "Present",
      "is_current": true,
      "description": "Led backend API migration to microservices.",
      "technologies": ["Python", "FastAPI", "Kubernetes"]
    }
  ],
  "education": [
    {
      "institution": "University of Technology",
      "degree": "Bachelor of Science",
      "field_of_study": "Computer Science",
      "start_year": 2016,
      "end_year": 2020
    }
  ],
  "projects": [
    {
      "title": "Open Source Project",
      "description": "Built distributed job processor",
      "url": "https://github.com/example/proj",
      "technologies": ["Go", "Redis"]
    }
  ]
}

Return ONLY valid JSON without markdown wrapping.
"""


class ResumeParserAgent:
    def __init__(self, model_name: str | None = None):
        self.ai = AIService(model=model_name)

    async def parse_resume_text(self, resume_text: str) -> dict[str, Any]:
        """Parse raw resume text into structured profile dictionary."""
        prompt = f"Extract structured profile data from the following resume text:\n\n{resume_text[:4000]}"
        result = (await self.ai.analyze(prompt, system_prompt=SYSTEM_PROMPT)).data

        # Ensure default keys exist
        return {
            "headline": result.get("headline", "Software Engineer"),
            "bio": result.get("bio", ""),
            "years_of_experience": result.get("years_of_experience", 0),
            "primary_role": result.get("primary_role", "Software Engineer"),
            "skills": result.get("skills", []),
            "experience": result.get("experience", []),
            "education": result.get("education", []),
            "projects": result.get("projects", []),
        }
