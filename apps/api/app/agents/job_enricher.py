"""
AI Job Post Enricher Agent.
"""

from typing import Dict, Any, List
from app.agents.llm_client import LLMClient
from app.core.logging import get_logger

logger = get_logger("agents.job_enricher")

SYSTEM_PROMPT = """
You are an AI Tech Job Analyst.
Given a job post title and description, analyze and return a clean JSON object with extracted requirements:

{
  "skills": ["Python", "FastAPI", "React", "PostgreSQL"],
  "experience_level": "senior",
  "primary_role": "Backend Engineer",
  "key_responsibilities": ["Design REST APIs", "Manage PostgreSQL database"],
  "tech_stack": ["Python", "FastAPI", "Docker"],
  "summary": "1-2 sentence executive summary of the position"
}

Return ONLY valid JSON.
"""


class JobEnricherAgent:
    def __init__(self, model_name: str = "ollama/qwen2.5"):
        self.client = LLMClient(model_override=model_name)

    async def enrich_job(self, title: str, description: str) -> Dict[str, Any]:
        """Analyze job post and extract clean structured requirements."""
        prompt = f"Title: {title}\n\nDescription:\n{description[:3000]}"
        result = await self.client.complete_structured_json(prompt, system_prompt=SYSTEM_PROMPT)
        
        return {
            "skills": result.get("skills", []),
            "experience_level": result.get("experience_level", "mid"),
            "primary_role": result.get("primary_role", "Software Engineer"),
            "key_responsibilities": result.get("key_responsibilities", []),
            "tech_stack": result.get("tech_stack", []),
            "summary": result.get("summary", ""),
        }
