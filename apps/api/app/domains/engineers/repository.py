"""
Repository pattern for Engineer Profile domain.
"""

import uuid
from collections.abc import Sequence

from sqlalchemy import Text, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domains.engineers.models import EngineerProfile
from app.domains.engineers.schemas import EngineerProfileCreate, EngineerProfileUpdate


class EngineerRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, profile_id: uuid.UUID) -> EngineerProfile | None:
        stmt = (
            select(EngineerProfile)
            .options(selectinload(EngineerProfile.user))
            .where(EngineerProfile.id == profile_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_user_id(self, user_id: uuid.UUID) -> EngineerProfile | None:
        stmt = (
            select(EngineerProfile)
            .options(selectinload(EngineerProfile.user))
            .where(EngineerProfile.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, user_id: uuid.UUID, data: EngineerProfileCreate) -> EngineerProfile:
        profile = EngineerProfile(
            user_id=user_id,
            headline=data.headline,
            bio=data.bio,
            location=data.location,
            country=data.country,
            profile_image_url=data.profile_image_url,
            years_of_experience=data.years_of_experience,
            primary_role=data.primary_role,
            certifications=data.certifications,
            previous_companies=data.previous_companies,
            employment_type=data.employment_type,
            available_hours=data.available_hours,
            github_url=data.github_url,
            linkedin_url=data.linkedin_url,
            portfolio_url=data.portfolio_url,
            skills=data.skills,
            experience=[item.model_dump() for item in data.experience],
            projects=[item.model_dump() for item in data.projects],
            education=[item.model_dump() for item in data.education],
            is_public=data.is_public,
            is_open_to_work=data.is_open_to_work,
        )
        self.db.add(profile)
        await self.db.flush()
        await self.db.refresh(profile)
        return profile

    async def update(
        self, profile: EngineerProfile, data: EngineerProfileUpdate
    ) -> EngineerProfile:
        update_dict = data.model_dump(exclude_unset=True)

        # Serialize nested schemas if present
        if "experience" in update_dict and update_dict["experience"] is not None:
            update_dict["experience"] = [
                item.model_dump() if hasattr(item, "model_dump") else item
                for item in update_dict["experience"]
            ]
        if "projects" in update_dict and update_dict["projects"] is not None:
            update_dict["projects"] = [
                item.model_dump() if hasattr(item, "model_dump") else item
                for item in update_dict["projects"]
            ]
        if "education" in update_dict and update_dict["education"] is not None:
            update_dict["education"] = [
                item.model_dump() if hasattr(item, "model_dump") else item
                for item in update_dict["education"]
            ]

        for field, value in update_dict.items():
            setattr(profile, field, value)

        await self.db.flush()
        await self.db.refresh(profile)
        return profile

    async def search(
        self,
        query: str | None = None,
        skills: list[str] | None = None,
        min_years_exp: int | None = None,
        primary_role: str | None = None,
        location: str | None = None,
        is_open_to_work: bool | None = None,
        skip: int = 0,
        limit: int = 20,
    ) -> Sequence[EngineerProfile]:
        stmt = (
            select(EngineerProfile)
            .options(selectinload(EngineerProfile.user))
            .where(EngineerProfile.is_public.is_(True))
        )

        if is_open_to_work is not None:
            stmt = stmt.where(EngineerProfile.is_open_to_work == is_open_to_work)

        if min_years_exp is not None:
            stmt = stmt.where(EngineerProfile.years_of_experience >= min_years_exp)

        if primary_role:
            stmt = stmt.where(
                func.lower(EngineerProfile.primary_role).contains(primary_role.lower())
            )

        if location:
            stmt = stmt.where(func.lower(EngineerProfile.location).contains(location.lower()))

        if skills:
            skill_filters = [
                cast(EngineerProfile.skills, Text).ilike(f'%"{skill.strip()}"%')
                for skill in skills
                if skill.strip()
            ]
            if skill_filters:
                stmt = stmt.where(or_(*skill_filters))

        if query:
            q = f"%{query.lower()}%"
            stmt = stmt.where(
                or_(
                    func.lower(EngineerProfile.headline).like(q),
                    func.lower(EngineerProfile.bio).like(q),
                    func.lower(EngineerProfile.primary_role).like(q),
                    cast(EngineerProfile.skills, Text).ilike(q),
                )
            )

        stmt = stmt.offset(skip).limit(limit).order_by(EngineerProfile.updated_at.desc())
        result = await self.db.execute(stmt)
        return result.scalars().all()
