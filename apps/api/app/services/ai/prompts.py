"""Versioned system prompts used by application-facing AI features."""

from dataclasses import dataclass


@dataclass(frozen=True)
class PromptTemplate:
    key: str
    version: str
    content: str


_PROMPTS = {
    "profile_improvement": PromptTemplate(
        key="profile_improvement",
        version="v1",
        content=(
            "Analyze this professional profile. Return only JSON with score (0-100), reason (array), "
            "skills_match (array of extracted skills), experience_match (array), recommendations "
            "(array of missing skills or improvements), and summary (string)."
        ),
    ),
}


def get_prompt(key: str) -> PromptTemplate:
    try:
        return _PROMPTS[key]
    except KeyError as exc:
        raise ValueError(f"Unknown AI prompt key: {key}") from exc
