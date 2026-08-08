"""AI Quality Engine domain — Pydantic schemas."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SubmissionEvaluationRequest(BaseModel):
    task_title: str = Field(..., min_length=1, max_length=200)
    task_description: str = Field(..., min_length=1)
    submission_content: str = Field(..., min_length=1)
    requirements: Optional[List[str]] = None


class CodeReviewRequest(BaseModel):
    task_description: str = Field(..., min_length=1)
    code_snippet: str = Field(..., min_length=1)
    language: str = Field(default="python", max_length=50)


class BatchEvaluationRequest(BaseModel):
    submissions: List[SubmissionEvaluationRequest] = Field(..., min_length=1, max_length=10)


class QualityDimension(BaseModel):
    score: int
    note: str


class QualityIssue(BaseModel):
    severity: str  # critical, warning, info
    category: str
    description: str


class SubmissionQualityReport(BaseModel):
    overall_score: int
    grade: str
    verdict: str  # approved, approved_with_notes, revision_required, rejected
    summary: str
    dimensions: Dict[str, Any]
    issues: List[QualityIssue]
    strengths: List[str]
    recommended_actions: List[str]
    requires_revision: bool
    revision_notes: Optional[str]


class LineComment(BaseModel):
    line: Optional[int]
    severity: str
    comment: str


class ComplexityAnalysis(BaseModel):
    cyclomatic_complexity: Optional[str] = None
    maintainability_index: Optional[str] = None
    notes: Optional[str] = None


class CodeReviewReport(BaseModel):
    overall_score: int
    grade: str
    verdict: str
    summary: str
    line_comments: List[Dict[str, Any]]
    security_flags: List[str]
    complexity_analysis: Dict[str, Any]
    suggestions: List[str]
    requires_revision: bool


class BatchQualityReport(BaseModel):
    results: List[SubmissionQualityReport]
    evaluated: int
    avg_score: float
