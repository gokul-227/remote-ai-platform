from typing import Any

from pydantic import BaseModel, Field


class AIResponse(BaseModel):
    """Provider-neutral contract for every AI-assisted application feature."""

    score: float = Field(default=0, ge=0, le=100)
    reason: list[str] = Field(default_factory=list)
    skills_match: list[str] = Field(default_factory=list)
    experience_match: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    data: dict[str, Any] = Field(default_factory=dict)
