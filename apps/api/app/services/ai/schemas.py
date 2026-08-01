from typing import Any, Dict, List

from pydantic import BaseModel, Field


class AIResponse(BaseModel):
    """Provider-neutral contract for every AI-assisted application feature."""

    score: float = Field(default=0, ge=0, le=100)
    reason: List[str] = Field(default_factory=list)
    skills_match: List[str] = Field(default_factory=list)
    experience_match: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    data: Dict[str, Any] = Field(default_factory=dict)
