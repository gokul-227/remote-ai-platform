import pytest

from app.agents.job_enricher import JobEnricherAgent
from app.agents.llm_client import LLMClient
from app.services.ai import AIService


@pytest.mark.asyncio
async def test_profile_ai_enhancement_returns_provider_neutral_data(monkeypatch):
    async def fake_completion(self, prompt, system_prompt):
        return {
            "score": 88,
            "reason": ["Strong backend profile"],
            "skills_match": ["Python", "FastAPI"],
            "experience_match": ["5 years"],
            "recommendations": ["Add cloud deployment experience"],
            "summary": "Backend engineer building reliable APIs.",
        }

    monkeypatch.setattr(LLMClient, "complete_structured_json", fake_completion)
    result = await AIService().improve_profile("Python backend engineer")
    assert result.score == 88
    assert result.skills_match == ["Python", "FastAPI"]
    assert result.recommendations


@pytest.mark.asyncio
async def test_job_analysis_returns_tasks(monkeypatch):
    async def fake_completion(self, prompt, system_prompt):
        return {
            "score": 90,
            "reason": ["Clear project scope"],
            "skills_match": ["React", "Python"],
            "experience_match": ["mid"],
            "recommendations": [],
            "summary": "A SaaS application project.",
            "skills": ["React", "Python"],
            "tech_stack": ["Next.js", "FastAPI"],
            "milestones": [{"title": "Foundation", "tasks": ["Create API"]}],
            "tasks": [{"title": "Create API", "milestone": "Foundation", "skills": ["Python"]}],
        }

    monkeypatch.setattr(LLMClient, "complete_structured_json", fake_completion)
    result = await JobEnricherAgent().enrich_job("Build SaaS", "Build a SaaS application")
    assert result["tasks"][0]["title"] == "Create API"
    assert result["tech_stack"] == ["Next.js", "FastAPI"]


@pytest.mark.asyncio
async def test_matching_contract_contains_explanation(monkeypatch):
    async def fake_completion(self, prompt, system_prompt):
        return {"score": 95, "reason": ["Skills and experience align"], "skills_match": ["Python"], "experience_match": ["5 years"], "recommendations": []}

    monkeypatch.setattr(LLMClient, "complete_structured_json", fake_completion)
    result = await AIService().analyze("candidate and job", "Return provider-neutral JSON")
    assert result.score == 95
    assert result.reason == ["Skills and experience align"]
