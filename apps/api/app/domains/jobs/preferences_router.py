"""Stated job preferences: what the professional is looking for.

Mounted before the jobs router so `/jobs/preferences/me` is never shadowed by
`/jobs/{job_id}`.
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.dependencies import get_current_user
from app.domains.auth.models import User
from app.domains.jobs.models import JobPreference

router = APIRouter(prefix="/jobs/preferences", tags=["Job Preferences"])

JOB_TYPES = ("full-time", "part-time", "contract", "freelance", "internship", "temporary")


class JobPreferenceIn(BaseModel):
    titles: list[str] = Field(default_factory=list, max_length=10)
    job_types: list[str] = Field(default_factory=list, max_length=6)
    remote_scope: str = Field(default="remote", pattern="^(remote|hybrid|any)$")
    locations: list[str] = Field(default_factory=list, max_length=10)
    min_salary: float | None = Field(default=None, ge=0, le=10_000_000)
    currency: str = Field(default="USD", min_length=3, max_length=10)
    notify_new_matches: bool = True

    @field_validator("titles", "locations", mode="before")
    @classmethod
    def _clean(cls, value: object) -> object:
        if isinstance(value, list):
            return [str(v).strip()[:80] for v in value if str(v).strip()]
        return value

    @field_validator("job_types")
    @classmethod
    def _types(cls, value: list[str]) -> list[str]:
        out = [v.strip().lower() for v in value if v.strip().lower() in JOB_TYPES]
        return sorted(set(out))


class JobPreferenceOut(JobPreferenceIn):
    model_config = ConfigDict(from_attributes=True)
    updated_at: datetime | None = None


def summary(pref: JobPreference | None) -> str:
    """One editable sentence, as shown on the jobs home."""
    if pref is None:
        return "Tell us what you are looking for to get better recommendations."
    parts: list[str] = []
    if pref.job_types:
        parts.append(", ".join(pref.job_types))
    parts.append(" or ".join(pref.titles) if pref.titles else "any role")
    scope = {"remote": "remote", "hybrid": "hybrid or remote", "any": "any workplace"}[
        pref.remote_scope
    ]
    parts.append(scope)
    if pref.locations:
        parts.append("in " + ", ".join(pref.locations))
    if pref.min_salary:
        parts.append(f"from {int(pref.min_salary):,} {pref.currency}")
    return " · ".join(parts)


@router.get("/me", response_model=JobPreferenceOut | None)
async def get_my_preferences(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> JobPreference | None:
    return await db.get(JobPreference, user.id)


@router.put("/me", response_model=JobPreferenceOut)
async def put_my_preferences(
    body: JobPreferenceIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JobPreference:
    pref = await db.get(JobPreference, user.id)
    if pref is None:
        pref = JobPreference(user_id=user.id)
        db.add(pref)
    for field, value in body.model_dump().items():
        setattr(pref, field, value)
    await db.flush()
    await db.refresh(pref)
    return pref


@router.get("/me/summary")
async def my_preference_summary(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict[str, str | bool]:
    pref = await db.get(JobPreference, user.id)
    return {"summary": summary(pref), "configured": pref is not None}
