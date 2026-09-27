"""
User entity model for authentication and role management.
"""

import enum
import hashlib
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.domains.companies.models import CompanyProfile
    from app.domains.engineers.models import EngineerProfile


class UserRole(str, enum.Enum):
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

    Tokens issued at or before `deleted_at` are refused, so a still-valid
    token cannot silently re-create the account. Only a hash of the identity
    subject is kept (no email or name); a deliberate new sign-in afterwards
    starts a fresh account.
    """

    __tablename__ = "deleted_identities"

    subject_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


def identity_hash(subject: str) -> str:
    return hashlib.sha256(subject.encode()).hexdigest()
