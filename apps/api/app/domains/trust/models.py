"""
Trust & Reputation domain SQLAlchemy models — UserVerification, UserTrustScore.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserVerification(Base):
    __tablename__ = "user_verifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # IDENTITY, GITHUB, LINKEDIN, SKILL_ASSESSMENT
    verification_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # SELF_REPORTED (submitted by the user, no evidence checked), PENDING (queued for
    # admin review), VERIFIED (an admin confirmed evidence), REJECTED
    status: Mapped[str] = mapped_column(String(30), default="SELF_REPORTED", nullable=False)
    verifier_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class UserTrustScore(Base):
    __tablename__ = "user_trust_scores"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    overall_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    completion_rate: Mapped[float] = mapped_column(Float, default=100.0, nullable=False)
    on_time_rate: Mapped[float] = mapped_column(Float, default=100.0, nullable=False)
    rating_avg: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    review_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    verified_skills_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    score_breakdown: Mapped[dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), default=dict, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
