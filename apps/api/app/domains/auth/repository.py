"""
Repository pattern implementation for User persistence.
"""

import uuid
from typing import Optional, List, Sequence
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User, UserRole
from app.domains.auth.schemas import UserCreate, UserUpdate


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: uuid.UUID) -> Optional[User]:
        stmt = select(User).where(User.id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[User]:
        stmt = select(User).where(func.lower(User.email) == func.lower(email))
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_keycloak_id(self, keycloak_id: str) -> Optional[User]:
        stmt = select(User).where(User.keycloak_id == keycloak_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, data: UserCreate) -> User:
        user = User(
            keycloak_id=data.keycloak_id,
            email=data.email,
            full_name=data.full_name,
            role=data.role,
            avatar_url=data.avatar_url,
            is_active=data.is_active,
        )
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def update(self, user: User, data: UserUpdate) -> User:
        update_dict = data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(user, field, value)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def list_users(
        self,
        skip: int = 0,
        limit: int = 50,
        role: Optional[UserRole] = None,
        is_active: Optional[bool] = None,
    ) -> Sequence[User]:
        stmt = select(User)
        if role is not None:
            stmt = stmt.where(User.role == role)
        if is_active is not None:
            stmt = stmt.where(User.is_active == is_active)
        stmt = stmt.offset(skip).limit(limit).order_by(User.created_at.desc())
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def count(
        self,
        role: Optional[UserRole] = None,
        is_active: Optional[bool] = None,
    ) -> int:
        stmt = select(func.count(User.id))
        if role is not None:
            stmt = stmt.where(User.role == role)
        if is_active is not None:
            stmt = stmt.where(User.is_active == is_active)
        result = await self.db.execute(stmt)
        return result.scalar_one() or 0
