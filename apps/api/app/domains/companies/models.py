"""
Company Profile domain models.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.domains.auth.models import User


class CompanyProfile(Base):
    __tablename__ = "company_profiles"

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

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    website: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    industry: Mapped[str | None] = mapped_column(String(255), nullable=True)
    company_size: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # e.g., "1-10", "11-50"
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hiring_status: Mapped[str | None] = mapped_column(
        String(50), default="actively_hiring", nullable=True
    )

    tech_stack: Mapped[list[str]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=list, nullable=False
    )
    # Indexed: CompanyRepository.list_companies() filters on this when the
    # `is_verified` query param is passed.
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)

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
    user: Mapped["User"] = relationship("User", back_populates="company_profile")

    def __repr__(self) -> str:
        return f"<CompanyProfile id={self.id} name={self.name}>"


ORG_ROLES = ("owner", "admin", "recruiter", "member")
# Roles allowed to publish jobs, review applicants and invite candidates.
HIRING_ROLES = frozenset({"owner", "admin", "recruiter"})
# Roles allowed to manage the organisation itself (members, page).
MANAGING_ROLES = frozenset({"owner", "admin"})


class OrganisationMember(Base):
    """A user's role inside an organisation (company profile).

    The profile's `user_id` is the implicit owner and never needs a row. Rows
    start as `invited` and become `active` when the invited user accepts.
    """

    __tablename__ = "organisation_members"
    __table_args__ = (
        UniqueConstraint("company_id", "user_id", name="uq_organisation_members_company_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="member")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="invited")
    # Who invited (no FK: audit detail, not an ownership link).
    invited_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
