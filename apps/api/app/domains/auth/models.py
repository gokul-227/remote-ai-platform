"""
User entity model for authentication and role management.
"""

import enum
import hashlib
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.domains.companies.models import CompanyProfile
    from app.domains.engineers.models import EngineerProfile


class UserRole(enum.StrEnum):
    ENGINEER = "ENGINEER"
    COMPANY = "COMPANY"
    ADMIN = "ADMIN"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    # Subject ("sub") of the user's identity in Supabase Auth.
    auth_subject: Mapped[str | None] = mapped_column(
        String(255),
        unique=True,
        nullable=True,
        index=True,
    )
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )
    full_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole, name="user_role_enum", create_type=False),
        nullable=False,
        default=UserRole.ENGINEER,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    # Access tokens issued at or before this instant are rejected (sign out everywhere).
    sessions_revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    avatar_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
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

    # Relationships (lazy dynamic / optional)
    engineer_profile: Mapped[Optional["EngineerProfile"]] = relationship(
        "EngineerProfile",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    company_profile: Mapped[Optional["CompanyProfile"]] = relationship(
        "CompanyProfile",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} role={self.role}>"



class DeletedIdentity(Base):
    """An identity whose account was deleted by its owner.

    Every token for this subject is refused, whenever it was issued: a
    refreshed token postdates the deletion but belongs to the old session, and
    the token's `iat` cannot tell the two apart. Signing up again creates a
    new Supabase user, i.e. a new subject and a fresh account.

    Only a hash of the subject is kept long term. The raw subject (a random
    UUID, no email or name) is held in `pending_subject` just until the
    Supabase user is erased, so a failed erasure can be retried (see
    app/domains/auth/erasure.py).
    """

    __tablename__ = "deleted_identities"

    subject_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    pending_subject: Mapped[str | None] = mapped_column(String(64), nullable=True)
    provider_erased_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    provider_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    last_error: Mapped[str | None] = mapped_column(String(64), nullable=True)


def identity_hash(subject: str) -> str:
    return hashlib.sha256(subject.encode()).hexdigest()
