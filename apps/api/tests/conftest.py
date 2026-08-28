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
from app.core.security import get_password_hash
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
    keycloak_id = str(uuid.uuid4())
    user = User(
        id=uuid.uuid4(),
        keycloak_id=keycloak_id,
        email="test@example.com",
        full_name="Test User",
        password_hash=get_password_hash("TestPassword123!"),
        role=UserRole.ENGINEER,
        is_active=True,
        token_version=1,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

@pytest.fixture
async def auth_headers(test_user: User) -> dict[str, str]:
    """Generate JWT auth headers for the test user."""
    from app.domains.auth.router import create_access_token
    token = create_access_token(test_user)
    return {"Authorization": f"Bearer {token}"}


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
