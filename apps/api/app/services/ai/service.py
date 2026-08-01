from typing import Any, Dict, Optional

from app.agents.llm_client import LLMClient
from app.services.ai.schemas import AIResponse


class AIService:
    """Application-facing AI service; provider access stays behind LiteLLM."""

    def __init__(self, model: Optional[str] = None):
        self.client = LLMClient(model_override=model)

    async def analyze(self, prompt: str, system_prompt: str) -> AIResponse:
        raw: Dict[str, Any] = await self.client.complete_structured_json(prompt, system_prompt)
        reason = raw.get("reason", raw.get("summary", ""))
        if isinstance(reason, str):
            reason = [reason] if reason else []
        skills = raw.get("skills_match", raw.get("skills", []))
        experience = raw.get("experience_match", raw.get("experience_level", []))
        if isinstance(experience, str):
            experience = [experience] if experience else []
        recommendations = raw.get("recommendations", raw.get("key_responsibilities", []))
        return AIResponse(
            score=float(raw.get("score", 0) or 0),
            reason=reason or [],
            skills_match=skills or [],
            experience_match=experience or [],
            recommendations=recommendations or [],
            data=raw,
        )

    async def improve_profile(self, profile_text: str) -> AIResponse:
        return await self.analyze(
            profile_text,
            "Analyze this professional profile. Return only JSON with score (0-100), reason (array), skills_match (array of extracted skills), experience_match (array), recommendations (array of missing skills or improvements), and summary (string).",
        )
