"""Test-only stand-in for Supabase Auth.

Production has exactly one sign-in path: the frontend signs in with Supabase
and the API verifies Supabase-issued ES256 access tokens against Supabase's
JWKS. Tests use the same verification code with a locally generated key in
place of Supabase's, and a test-only sign-up/sign-in router (never mounted
outside the test process) that creates the user row and returns such a token.
"""

import time
import uuid
from types import SimpleNamespace

import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.auth.models import User, UserRole
from app.domains.auth.repository import UserRepository
from app.domains.auth.schemas import UserResponse

TEST_SUPABASE_URL = "https://test-project.supabase.co"
PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
FAKE_JWKS_CLIENT = SimpleNamespace(
    get_signing_key_from_jwt=lambda token: SimpleNamespace(key=PRIVATE_KEY.public_key())
)


def mint_token(subject: str, email: str | None, issued_at: int | None = None) -> str:
    now = issued_at if issued_at is not None else int(time.time())
    claims = {
        "sub": subject,
        "email": email,
        "aud": "authenticated",
        "role": "authenticated",
        "iss": f"{TEST_SUPABASE_URL}/auth/v1",
        "iat": now,
        "exp": now + 3600,
    }
    return jwt.encode(claims, PRIVATE_KEY, algorithm="ES256")


def token_for(user: User) -> str:
    return mint_token(user.auth_subject or str(user.id), user.email)


class _SignUp(BaseModel):
    email: EmailStr
    password: str | None = None  # accepted and ignored, like an email-code sign-up
    full_name: str
    role: UserRole = UserRole.ENGINEER

    @field_validator("role", mode="before")
    @classmethod
    def _upper(cls, value: object) -> object:
        return value.upper() if isinstance(value, str) else value


class _SignIn(BaseModel):
    email: EmailStr
    password: str | None = None


test_auth_router = APIRouter(prefix="/api/v1/auth", tags=["test-only"])


def _session(user: User) -> dict:
    return {
        "access_token": token_for(user),
        "token_type": "bearer",
        "user": UserResponse.model_validate(user).model_dump(mode="json"),
    }


@test_auth_router.post("/register")
async def register(data: _SignUp, db: AsyncSession = Depends(get_db)) -> dict:
    repo = UserRepository(db)
    if await repo.get_by_email(data.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        id=uuid.uuid4(),
        auth_subject=str(uuid.uuid4()),
        email=data.email,
        full_name=data.full_name,
        role=data.role,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return _session(user)


@test_auth_router.post("/login")
async def login(data: _SignIn, db: AsyncSession = Depends(get_db)) -> dict:
    user = await UserRepository(db).get_by_email(data.email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid login")
    return _session(user)
