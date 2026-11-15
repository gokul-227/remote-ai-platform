"""
Pydantic schemas for Job Post domain.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.schemas import unique_skills


class JobPostBase(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    description: str
    # Optional at the request layer: company-posted jobs have this derived
    # server-side from the caller's CompanyProfile (see jobs/router.py create_job).
    # Aggregator/demo-seeded jobs always pass it explicitly. JobService.create_job
    # rejects a request where it's still missing after that derivation.
    company_name: str | None = Field(default=None, max_length=255)
    company_logo: str | None = None
    location: str | None = "Remote"
    is_remote: bool = True
    # "unspecified" / None when the source doesn't say; never guessed.
    job_type: str = "unspecified"
    experience_level: str | None = None
    budget_min: float | None = Field(default=None, ge=0)
    budget_max: float | None = Field(default=None, ge=0)
    timeline: str | None = None
    remote_preference: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    # year | month | hour | project; None when the source doesn't say.
    salary_period: str | None = Field(default=None, pattern="^(year|month|week|day|hour|project)$")
    currency: str = "USD"
    skills: list[str] = []
    external_url: str | None = None
    ai_analysis: dict[str, Any] | None = None

    _unique_skills = field_validator("skills")(classmethod(lambda cls, v: unique_skills(v)))


class JobFilterFields(BaseModel):
    """Structured search-filter fields (derive.py). On create, values a source
    states go here and win over text heuristics; None means unknown."""

    workplace_type: str | None = Field(default=None, pattern="^(remote|hybrid|onsite)$")
    seniority: str | None = Field(
        default=None, pattern="^(internship|entry|associate|mid_senior|director|executive)$"
    )
    country_code: str | None = Field(default=None, min_length=2, max_length=2)
    region: str | None = None
    tz_min: int | None = None
    tz_max: int | None = None
    industry: str | None = None
    job_function: str | None = None
    visa_sponsorship: bool | None = None
    language: str | None = None


class JobPostCreate(JobPostBase, JobFilterFields):
    company_id: uuid.UUID | None = None
    external_id: str | None = None
    source: str = "DIRECT"
    # When the source says it was posted; None means "first seen now".
    posted_at: datetime | None = None
    # Cross-source identity (normalized title + company + location); set on import.
    dedup_key: str | None = None


class JobPostUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    company_name: str | None = None
    company_logo: str | None = None
    location: str | None = None
    is_remote: bool | None = None
    job_type: str | None = None
    experience_level: str | None = None
    budget_min: float | None = None
    budget_max: float | None = None
    timeline: str | None = None
    remote_preference: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    salary_period: str | None = Field(default=None, pattern="^(year|month|hour|project)$")
    currency: str | None = None
    skills: list[str] | None = None
    external_url: str | None = None
    is_active: bool | None = None

    _unique_skills = field_validator("skills")(classmethod(lambda cls, v: unique_skills(v)))


class JobPostResponse(JobPostBase, JobFilterFields):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID | None = None
    slug: str
    external_id: str | None = None
    source: str
    is_active: bool
    posted_at: datetime
    # Set when an imported listing's source stopped listing it.
    expired_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    budget_min: float | None = None
    budget_max: float | None = None
    timeline: str | None = None
    remote_preference: str | None = None
    ai_analysis: dict[str, Any] | None = None


class JobSearchQuery(BaseModel):
    """Every job-search filter. Lists match any of their values (OR within a
    filter, AND across filters). Unknown (NULL) values never match a filter."""

    query: str | None = None
    skills: list[str] | None = None
    is_remote: bool | None = True
    job_type: list[str] | None = None
    experience_level: str | None = None
    min_salary: float | None = None
    max_salary: float | None = None
    salary_currency: str | None = None
    salary_period: str | None = None
    source: list[str] | None = None
    company_id: uuid.UUID | None = None
    location: str | None = None
    employer: str | None = None
    workplace: list[str] | None = None
    seniority: list[str] | None = None
    country: list[str] | None = None
    region: list[str] | None = None
    industry: list[str] | None = None
    job_function: list[str] | None = None
    language: list[str] | None = None
    company: list[str] | None = None
    posted_within: str | None = None
    has_salary: bool | None = None
    apply: str | None = None
    visa_sponsorship: bool | None = None
    tz: int | None = None
    verified: bool | None = None
    sort: str = "recent"
    skip: int = 0
    limit: int = 20

    def filters(self) -> dict[str, Any]:
        """The filter fields, as the repository's search/count/facets take them."""
        return self.model_dump(exclude={"skip", "limit", "sort"})


class FacetValue(BaseModel):
    value: str | bool
    count: int


class JobFacets(BaseModel):
    total: int
    facets: dict[str, list[FacetValue]]


class JobSitemapEntry(BaseModel):
    """Just enough for a sitemap URL: no title or description (SEO-01)."""

    id: uuid.UUID
    posted_at: datetime
    updated_at: datetime


class LandingCompany(BaseModel):
    name: str
    count: int


class LandingSalary(BaseModel):
    """Pay published by matching jobs, in their most common currency and period."""

    currency: str
    period: str
    count: int
    low: float
    median: float
    high: float


class JobLandingStats(BaseModel):
    """Aggregates behind a public landing page's intro text (all from real rows)."""

    total: int
    new_last_7_days: int
    top_companies: list[LandingCompany]
    salary: LandingSalary | None = None


class JobEmployer(BaseModel):
    slug: str
    name: str
    count: int
    latest_posted_at: datetime | None = None


class JobAvailability(BaseModel):
    """live | expired | gone: whether the public job page answers 200 or 410."""

    state: str
