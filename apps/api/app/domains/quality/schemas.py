"""AI Quality Engine domain — Pydantic schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SubmissionEvaluationRequest(BaseModel):
    task_title: str = Field(..., min_length=1, max_length=200)
    task_description: str = Field(..., min_length=1)
    submission_content: str = Field(..., min_length=1)
    requirements: list[str] | None = None


class CodeReviewRequest(BaseModel):
    task_description: str = Field(..., min_length=1)
    code_snippet: str = Field(..., min_length=1)
    language: str = Field(default="python", max_length=50)


class BatchEvaluationRequest(BaseModel):
    submissions: list[SubmissionEvaluationRequest] = Field(..., min_length=1, max_length=10)


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
    dimensions: dict[str, Any]
    issues: list[QualityIssue]
    strengths: list[str]
    recommended_actions: list[str]
    requires_revision: bool
    revision_notes: str | None


class LineComment(BaseModel):
    line: int | None
    severity: str
    comment: str


class ComplexityAnalysis(BaseModel):
    cyclomatic_complexity: str | None = None
    maintainability_index: str | None = None
    notes: str | None = None


class CodeReviewReport(BaseModel):
    overall_score: int
    grade: str
    verdict: str
    summary: str
    line_comments: list[dict[str, Any]]
    security_flags: list[str]
    complexity_analysis: dict[str, Any]
    suggestions: list[str]
    requires_revision: bool


class BatchQualityReport(BaseModel):
    results: list[SubmissionQualityReport]
    evaluated: int
    avg_score: float
