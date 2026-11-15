"""
Job Post domain models.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.domains.companies.models import CompanyProfile


class JobPost(Base):
    """A job listing. Storage at scale (migration 070): low-selectivity boolean
    indexes and btree duplicates of the trigram indexes are gone; listing by
    recency uses partial indexes over live rows only (see that migration)."""

    __tablename__ = "job_posts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    company_logo: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_remote: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    job_type: Mapped[str] = mapped_column(
        String(50), default="unspecified", nullable=False
    )  # full-time, part-time, contract, freelance, internship, temporary, unspecified
    experience_level: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # junior, mid, senior, lead
    budget_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    budget_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    timeline: Mapped[str | None] = mapped_column(String(100), nullable=True)
    remote_preference: Mapped[str | None] = mapped_column(String(100), nullable=True)

    salary_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    salary_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    salary_period: Mapped[str | None] = mapped_column(String(20), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), default="USD", nullable=False)

    skills: Mapped[list[str]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False
    )
    ai_analysis: Mapped[dict[str, Any] | None] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=True
    )

    # Aggregator fields
    external_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True, index=True
    )
    external_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(
        String(50), default="DIRECT", nullable=False, index=True
    )  # REMOTEOK, ARBEITNOW, REMOTIVE, USAJOBS, THEMUSE, DIRECT
    # md5 of normalized title|company|location: one listing per posting across sources.
    dedup_key: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)

    # Search filters (migration 074, app/domains/jobs/derive.py). None = unknown;
    # never guessed. Small codes keep rows small; see the migration for indexes.
    workplace_type: Mapped[str | None] = mapped_column(String(8), nullable=True)  # remote|hybrid|onsite
    seniority: Mapped[str | None] = mapped_column(String(12), nullable=True)
    country_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    region: Mapped[str | None] = mapped_column(String(16), nullable=True)
    tz_min: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)  # UTC offset hours
    tz_max: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    industry: Mapped[str | None] = mapped_column(String(24), nullable=True)
    job_function: Mapped[str | None] = mapped_column(String(24), nullable=True)
    visa_sponsorship: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    language: Mapped[str | None] = mapped_column(String(5), nullable=True)
    # Version of derive.py rules applied; the backfill task re-derives older rows.
    derived_version: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Imported jobs: when a sync last saw it, and when it expired for not being
    # seen. Separate from is_active, which is the moderation switch.
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expired_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    posted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Optional relationship
    company: Mapped[Optional["CompanyProfile"]] = relationship("CompanyProfile")

    def __repr__(self) -> str:
        return f"<JobPost id={self.id} title='{self.title}' company='{self.company_name}' source='{self.source}'>"


class JobPreference(Base):
    """What a professional is looking for; drives recommendations and alerts.

    Stated preferences, separate from the profile: titles, job types, remote scope,
    locations and a salary floor. Shown as an editable sentence on the jobs home.
    """

    __tablename__ = "job_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    titles: Mapped[list[str]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=False, default=list)
    job_types: Mapped[list[str]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=False, default=list)
    remote_scope: Mapped[str] = mapped_column(String(20), nullable=False, default="remote")  # remote | hybrid | any
    locations: Mapped[list[str]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=False, default=list)
    min_salary: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    notify_new_matches: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class SavedJobSearch(Base):
    """A member's saved job search ("Save this search"). `params` is the search's
    filters (the same names as GET /jobs); alerts go through the member's
    notification preferences for the "job" category (in-app/email/push)."""

    __tablename__ = "saved_job_searches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    params: Mapped[dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=False, default=dict
    )
    alerts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    frequency: Mapped[str] = mapped_column(String(10), nullable=False, default="daily")
    last_notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
