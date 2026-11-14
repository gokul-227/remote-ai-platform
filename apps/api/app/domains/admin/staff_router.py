"""
Staff roles and feature-flag overrides.

    GET  /admin/me/permissions          the caller's staff roles (any staff)
    GET  /admin/staff-roles             every ADMIN account and its roles (super_admin)
    PUT  /admin/staff-roles/{user_id}   replace someone's staff roles (super_admin, reason)
    GET  /admin/feature-flags/state     env default, override and effective value (staff)
    PUT  /admin/feature-flags/{name}    set or clear an override (ops_admin/super_admin, reason)

Every change is audited with its reason. A super administrator cannot remove
their own super_admin role, so the console can never be locked out.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import feature_flags
from app.core.audit import record_audit_event
from app.core.database import get_db
from app.domains.admin.flag_models import FeatureFlagOverride
from app.domains.admin.staff import STAFF_ROLES, StaffRole, roles_of
from app.domains.auth.dependencies import require_role
from app.domains.auth.models import User, UserRole

router = APIRouter(prefix="/admin", tags=["Admin Staff"])
staff = require_role(UserRole.ADMIN)


class RolesIn(BaseModel):
    roles: list[str] = Field(min_length=1, max_length=len(STAFF_ROLES))
    reason: str = Field(min_length=3, max_length=500)


class FlagIn(BaseModel):
    enabled: bool | None = None  # None clears the override (back to the env value)
    reason: str = Field(min_length=3, max_length=500)


@router.get("/me/permissions")
async def my_permissions(
    admin: User = Depends(staff), db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    explicit = (
        (await db.execute(select(StaffRole.role).where(StaffRole.user_id == admin.id)))
        .scalars()
        .all()
    )
    return {"roles": sorted(await roles_of(db, admin.id)), "implicit_super_admin": not explicit}


@router.get("/staff-roles")
async def list_staff(
    _: User = Depends(staff), db: AsyncSession = Depends(get_db)
) -> list[dict[str, Any]]:
    admins = (
        (await db.execute(select(User).where(User.role == UserRole.ADMIN).order_by(User.email)))
        .scalars()
        .all()
    )
    rows = (await db.execute(select(StaffRole))).scalars().all()
    by_user: dict[uuid.UUID, list[str]] = {}
    for r in rows:
        by_user.setdefault(r.user_id, []).append(r.role)
    return [
        {
            "user_id": str(a.id),
            "email": a.email,
            "full_name": a.full_name,
            "is_active": a.is_active,
            "roles": sorted(by_user.get(a.id, [])) or ["super_admin"],
            "implicit": a.id not in by_user,
        }
        for a in admins
    ]


@router.put("/staff-roles/{user_id}")
async def set_staff_roles(
    user_id: uuid.UUID,
    body: RolesIn,
    request: Request,
    admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    wanted = sorted(set(body.roles))
    unknown = [r for r in wanted if r not in STAFF_ROLES]
    if unknown:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown staff roles: {', '.join(unknown)}"
        )
    target = await db.get(User, user_id)
    if target is None or target.role != UserRole.ADMIN:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Staff account not found (the account must already be ADMIN)"
        )
    if target.id == admin.id and "super_admin" not in wanted:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You cannot remove your own super administrator role"
        )
    before = sorted(await roles_of(db, target.id))
    await db.execute(delete(StaffRole).where(StaffRole.user_id == target.id))
    for role in wanted:
        db.add(StaffRole(user_id=target.id, role=role, granted_by=admin.id))
    await record_audit_event(
        db,
        action="staff.roles.update",
        resource_type="user",
        resource_id=str(target.id),
        actor_id=admin.id,
        actor_role=admin.role.value,
        payload={"reason": body.reason, "before": before, "after": wanted},
        request=request,
    )
    await db.flush()
    return {"user_id": str(target.id), "roles": wanted}


@router.get("/feature-flags/state")
async def flag_state(
    _: User = Depends(staff), db: AsyncSession = Depends(get_db)
) -> list[dict[str, Any]]:
    await feature_flags.refresh_overrides(db)
    rows = {r.name: r for r in (await db.execute(select(FeatureFlagOverride))).scalars().all()}
    out = []
    for name in feature_flags.known_flags():
        o = rows.get(name)
        out.append(
            {
                "name": name,
                "env_default": feature_flags.env_value(name),
                "override": o.enabled if o else None,
                "effective": feature_flags.is_feature_enabled(name),
                "reason": o.reason if o else None,
                "updated_at": o.updated_at.isoformat() if o else None,
            }
        )
    return out


@router.put("/feature-flags/{name}")
async def set_flag(
    name: str,
    body: FlagIn,
    request: Request,
    admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    roles = await roles_of(db, admin.id)
    if not roles & {"super_admin", "ops_admin"}:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Only operations or super administrators change feature flags",
        )
    if name not in feature_flags.known_flags():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown feature flag")
    existing = await db.get(FeatureFlagOverride, name)
    before = feature_flags.is_feature_enabled(name)
    if body.enabled is None:
        if existing is not None:
            await db.delete(existing)
    elif existing is None:
        db.add(
            FeatureFlagOverride(
                name=name, enabled=body.enabled, reason=body.reason, updated_by=admin.id
            )
        )
    else:
        existing.enabled = body.enabled
        existing.reason = body.reason
        existing.updated_by = admin.id
    await db.flush()
    await feature_flags.refresh_overrides(db)
    after = feature_flags.is_feature_enabled(name)
    await record_audit_event(
        db,
        action="feature_flag.update",
        resource_type="feature_flag",
        resource_id=name,
        actor_id=admin.id,
        actor_role=admin.role.value,
        payload={"reason": body.reason, "before": before, "after": after, "override": body.enabled},
        request=request,
    )
    await db.flush()
    return {"name": name, "effective": after, "override": body.enabled}
