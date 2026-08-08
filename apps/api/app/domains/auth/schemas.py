"""
Pydantic schemas for Authentication domain.
"""

import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.domains.auth.models import UserRole


class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    role: UserRole = UserRole.ENGINEER
    avatar_url: Optional[str] = None


class UserCreate(UserBase):
    keycloak_id: Optional[str] = None
    is_active: bool = True
    password_hash: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    role: Optional[UserRole] = None
    avatar_url: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    keycloak_id: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TokenPayload(BaseModel):
    sub: str  # keycloak_id
    email: Optional[str] = None
    name: Optional[str] = None
    preferred_username: Optional[str] = None
    given_name: Optional[str] = None
    family_name: Optional[str] = None
    realm_access: Optional[dict] = None
    resource_access: Optional[dict] = None
    roles: List[str] = []
    exp: Optional[int] = None
    iat: Optional[int] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: Optional[str] = None
    scope: Optional[str] = None
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class AuthSyncRequest(BaseModel):
    keycloak_id: str
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.ENGINEER
    avatar_url: Optional[str] = None


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=1, max_length=255)
    role: UserRole = UserRole.ENGINEER

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, value: UserRole | str) -> UserRole | str:
        return value.upper() if isinstance(value, str) else value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginUrlResponse(BaseModel):
    login_url: str


class LogoutUrlResponse(BaseModel):
    logout_url: str
