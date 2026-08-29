"""
Pydantic schemas for Authentication domain.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.domains.auth.models import UserRole


class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    role: UserRole = UserRole.ENGINEER
    avatar_url: str | None = None


class UserCreate(UserBase):
    keycloak_id: str | None = None
    is_active: bool = True
    password_hash: str | None = None


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    role: UserRole | None = None
    avatar_url: str | None = None
    is_active: bool | None = None


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    keycloak_id: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TokenPayload(BaseModel):
    sub: str  # keycloak_id
    email: str | None = None
    name: str | None = None
    preferred_username: str | None = None
    given_name: str | None = None
    family_name: str | None = None
    realm_access: dict | None = None
    resource_access: dict | None = None
    roles: list[str] = []
    v: int | None = None
    exp: int | None = None
    iat: int | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str | None = None
    scope: str | None = None
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class AuthSyncRequest(BaseModel):
    keycloak_id: str
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.ENGINEER
    avatar_url: str | None = None


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
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


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_token: str | None = None  # Returned in dev/test for immediate automation


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=16)
    new_password: str = Field(..., min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)
