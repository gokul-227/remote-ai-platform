"""
Job Post domain models.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import String, Boolean, DateTime, func, Text, Integer, Float, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.domains.companies.models import CompanyProfile


class JobPost(Base):
    __tablename__ = "job_posts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    
    company_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    company_logo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_remote: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    
    job_type: Mapped[str] = mapped_column(String(50), default="full-time", nullable=False)  # full-time, contract, part-time
    experience_level: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)     # junior, mid, senior, lead
    
    salary_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    salary_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(10), default="USD", nullable=False)
    
    skills: Mapped[List[str]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False)
    
    # Aggregator fields
    external_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True, index=True)
    external_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(50), default="DIRECT", nullable=False, index=True) # REMOTEOK, ARBEITNOW, REMOTIVE, USAJOBS, THEMUSE, DIRECT
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
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
