"""
Assistant domain SQLAlchemy models — actions the assistant proposed and the user must confirm.

A pending action freezes the exact, validated arguments the user reviewed; the
confirm call executes those arguments once (idempotently) and never re-asks the
model, so nothing the model or retrieved content says later can change it.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AssistantAction(Base):
    __tablename__ = "assistant_actions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tool: Mapped[str] = mapped_column(String(60), nullable=False)
    args: Mapped[dict[str, Any]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=False)
    summary: Mapped[str] = mapped_column(String(500), nullable=False)
    # PENDING, EXECUTED, CANCELLED, FAILED
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False, index=True)
    result: Mapped[dict[str, Any] | None] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
