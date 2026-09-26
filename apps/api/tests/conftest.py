"""
Pytest configuration and async test fixtures.
"""

import pytest
import asyncio
import uuid
from typing import AsyncGenerator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

from app.main import app
from app.core.database import Base, get_db
from app.domains.auth.models import User, UserRole

from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import JSONB, UUID


@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


@compiles(UUID, "sqlite")
def compile_uuid_sqlite(type_, compiler, **kw):
    return "CHAR(36)"


# Use SQLite in-memory for fast unit testing
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestingSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with TestingSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


app.dependency_overrides[get_db] = override_get_db

# Test-only sign-up/sign-in that mint Supabase-style tokens (see auth_support).
from auth_support import FAKE_JWKS_CLIENT, TEST_SUPABASE_URL, test_auth_router  # noqa: E402

app.include_router(test_auth_router)


@pytest.fixture(autouse=True)
def supabase_test_keys(monkeypatch):
    """Verify tokens with the test key instead of Supabase's JWKS."""
    from app.core.config import settings
    from app.domains.auth import supabase_auth

    monkeypatch.setattr(settings, "SUPABASE_URL", TEST_SUPABASE_URL)
    monkeypatch.setattr(supabase_auth, "_jwks_client", FAKE_JWKS_CLIENT)


@pytest.fixture(autouse=True)
def isolate_rate_limiting():
    """
    Isolate rate limiter state between tests.
    Sets high limit for general test suite and clears in-memory sliding windows.
    """
    from app.core.config import settings
    import app.core.rate_limiter as rl
    orig_limit = settings.RATE_LIMIT_MAX_REQUESTS
    settings.RATE_LIMIT_MAX_REQUESTS = 1000
    rl.reset_fallback_state()
    yield
    settings.RATE_LIMIT_MAX_REQUESTS = orig_limit
    rl.reset_fallback_state()


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as ac:
        yield ac

@pytest.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    async with TestingSessionLocal() as session:
        yield session

@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    """Create a test user with ENGINEER role."""
    user = User(
        id=uuid.uuid4(),
        auth_subject=str(uuid.uuid4()),
        email="test@example.com",
        full_name="Test User",
        role=UserRole.ENGINEER,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

@pytest.fixture
async def auth_headers(test_user: User) -> dict[str, str]:
    """Supabase-style bearer headers for the test user."""
    from auth_support import token_for
    return {"Authorization": f"Bearer {token_for(test_user)}"}


@pytest.fixture
async def engineer_token(client: AsyncClient) -> str:
    """Register an engineer and return a valid access token."""
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": f"engineer_{uuid.uuid4().hex[:8]}@test.com",
            "password": "EngineerPass123!",
            "full_name": "Test Engineer",
            "role": "ENGINEER",
        },
    )
    assert resp.status_code == 200, f"Engineer registration failed: {resp.text}"
    return resp.json()["access_token"]


@pytest.fixture
async def company_token(client: AsyncClient) -> str:
    """Register a company user and return a valid access token."""
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": f"company_{uuid.uuid4().hex[:8]}@test.com",
            "password": "CompanyPass123!",
            "full_name": "Test Company",
            "role": "COMPANY",
        },
    )
    assert resp.status_code == 200, f"Company registration failed: {resp.text}"
    return resp.json()["access_token"]


@pytest.fixture
def marketplace_payments_enabled():
    """Money movement is gated off by default; opt in for payment-flow tests."""
    from app.core.config import settings
    orig = settings.MARKETPLACE_PAYMENTS_ENABLED
    settings.MARKETPLACE_PAYMENTS_ENABLED = True
    yield
    settings.MARKETPLACE_PAYMENTS_ENABLED = orig
