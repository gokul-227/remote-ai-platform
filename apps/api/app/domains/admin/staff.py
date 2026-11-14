"""
Least-privilege staff roles (plan Part 9).

Every staff endpoint already requires `users.role == ADMIN`. On top of that,
`enforce_staff_scope` checks the caller's staff roles against the area of the
requested path:

- super_admin   everything, including assigning staff roles
- ops_admin     everything except staff-role management
- support       support desk; read access to users
- moderator     moderation and trust/verification
- eng_operator  health, background jobs, incidents, imports, usage, analytics
- auditor       read-only (GET) everywhere except staff-role management

An ADMIN with no rows in `staff_roles` is treated as super_admin, so existing
staff keep working; assigning any role to someone limits them to it. Roles are
only ever granted by a super_admin (never by sign-up), with a reason, audited.
"""

import uuid
from datetime import datetime

from fastapi import HTTPException, Request, status
from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func, select
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

STAFF_ROLES = ("super_admin", "ops_admin", "support", "moderator", "eng_operator", "auditor")

# First path segments after /api/v1 (and after /admin/) -> roles allowed to act there.
AREA_ROLES: dict[str, frozenset[str]] = {
    "staff-roles": frozenset({"super_admin"}),
    "support": frozenset({"ops_admin", "support"}),
    "users": frozenset({"ops_admin", "support"}),
    "moderation": frozenset({"ops_admin", "moderator"}),
    "trust": frozenset({"ops_admin", "moderator"}),
    "background": frozenset({"ops_admin", "eng_operator"}),
    "incidents": frozenset({"ops_admin", "eng_operator"}),
    "health": frozenset({"ops_admin", "eng_operator"}),
    "operations": frozenset({"ops_admin", "eng_operator"}),
    "sync-logs": frozenset({"ops_admin", "eng_operator"}),
    "search-status": frozenset({"ops_admin", "eng_operator"}),
    "usage": frozenset({"ops_admin", "eng_operator"}),
    "ai-usage": frozenset({"ops_admin", "eng_operator"}),
    "analytics": frozenset({"ops_admin", "eng_operator"}),
    "assistant-actions": frozenset({"ops_admin", "eng_operator"}),
    "jobs": frozenset({"ops_admin", "eng_operator"}),
    "feature-flags": frozenset({"ops_admin"}),
    "announcements": frozenset({"ops_admin"}),
}
# Read-only views every staff role may open (the console overview and own permissions).
SHARED_READ_AREAS = frozenset({"dashboard", "stats", "me", "feature-flags"})
DEFAULT_AREA_ROLES = frozenset({"ops_admin"})


class StaffRole(Base):
    __tablename__ = "staff_roles"
    __table_args__ = (UniqueConstraint("user_id", "role", name="uq_staff_roles_user_role"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    granted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


async def roles_of(db: AsyncSession, user_id: uuid.UUID) -> set[str]:
    rows = (
        (await db.execute(select(StaffRole.role).where(StaffRole.user_id == user_id)))
        .scalars()
        .all()
    )
    return set(rows) or {"super_admin"}


def area_of(path: str) -> str:
    parts = [p for p in path.split("/") if p]
    if parts[:2] == ["api", "v1"]:
        parts = parts[2:]
    if not parts:
        return ""
    if parts[0] == "admin":
        return parts[1] if len(parts) > 1 else ""
    if parts[0] == "jobs" and len(parts) > 1 and parts[1] == "sync":
        return "jobs"
    return parts[0]


def allowed(roles: set[str], area: str, method: str) -> bool:
    if "super_admin" in roles:
        return True
    if area == "staff-roles":
        return False
    if method in {"GET", "HEAD", "OPTIONS"} and ("auditor" in roles or area in SHARED_READ_AREAS):
        return True
    if "ops_admin" in roles:
        return True
    return bool(roles & AREA_ROLES.get(area, DEFAULT_AREA_ROLES))


async def enforce_staff_scope(request: Request, user_id: uuid.UUID, db: AsyncSession) -> None:
    roles = await roles_of(db, user_id)
    area = area_of(request.url.path)
    if not allowed(roles, area, request.method.upper()):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Your staff role does not cover this area ({area or 'console'}).",
        )
