"""
Engineer Profile domain models.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.domains.auth.models import User


class EngineerProfile(Base):
    __tablename__ = "engineer_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    headline: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    languages: Mapped[list[str]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False
    )
    years_of_experience: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    primary_role: Mapped[str | None] = mapped_column(String(255), nullable=True)
    profile_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    certifications: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False
    )
    previous_companies: Mapped[list[str]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False
    )
    employment_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    available_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hourly_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    desired_salary_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    availability: Mapped[str | None] = mapped_column(String(50), default="Immediate", nullable=True)
    remote_preference: Mapped[str | None] = mapped_column(
        String(50), default="100% Remote", nullable=True
    )
    github_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    portfolio_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # JSON columns for rich profile data
    skills: Mapped[list[str]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False
    )
    experience: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False
    )
    projects: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False
    )
    education: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False
    )

    # Resume & AI enrichment
    resume_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    parsed_resume_data: Mapped[dict[str, Any] | None] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=True
    )
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    profile_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    missing_skills: Mapped[list[str]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False
    )
    matching_keywords: Mapped[list[str]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False
    )

    # Profile visibility
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_open_to_work: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

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

    # Relationship
    user: Mapped["User"] = relationship("User", back_populates="engineer_profile")

    @property
    def full_name(self) -> str | None:
        """The profile owner's display name, sourced from the linked User.

        EngineerProfile has no name column of its own — every card/listing
        that needs to show "who this is" (not just their role/headline) must
        go through this. Callers querying EngineerProfile must eager-load
        `user` (see EngineerRepository) or this raises under async SQLAlchemy.
        """
        return self.user.full_name if self.user else None

    def __repr__(self) -> str:
        return f"<EngineerProfile id={self.id} user_id={self.user_id} headline={self.headline}>"
