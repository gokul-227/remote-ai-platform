"""
AI Job Match domain models.
"""

import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any, TYPE_CHECKING

from sqlalchemy import String, DateTime, func, Text, Float, ForeignKey, UniqueConstraint, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.domains.engineers.models import EngineerProfile
    from app.domains.jobs.models import JobPost


class JobMatch(Base):
    __tablename__ = "job_matches"
    __table_args__ = (
        UniqueConstraint("engineer_id", "job_id", name="uq_engineer_job_match"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    engineer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("engineer_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("job_posts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    overall_score: Mapped[float] = mapped_column(Float, nullable=False, index=True) # 0.0 to 100.0
    skill_score: Mapped[float] = mapped_column(Float, nullable=False)               # 0.0 to 100.0
    experience_score: Mapped[float] = mapped_column(Float, nullable=False)          # 0.0 to 100.0
    role_score: Mapped[float] = mapped_column(Float, nullable=False)                # 0.0 to 100.0
    timezone_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    availability_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    compensation_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    remote_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)

    reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    matching_skills: Mapped[List[str]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    missing_skills: Mapped[List[str]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)

    status: Mapped[str] = mapped_column(
        String(50), default="recommended", nullable=False, index=True
    )  # recommended, saved, applied, dismissed

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

    # Relationships
    engineer: Mapped["EngineerProfile"] = relationship("EngineerProfile")
    job: Mapped["JobPost"] = relationship("JobPost")

    def __repr__(self) -> str:
        return f"<JobMatch engineer_id={self.engineer_id} job_id={self.job_id} score={self.overall_score}%>"
