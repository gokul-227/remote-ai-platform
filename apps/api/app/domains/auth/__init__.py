"""
Auth Domain Package
"""

from app.domains.auth.dependencies import get_current_user, require_role
from app.domains.auth.models import User, UserRole
from app.domains.auth.repository import UserRepository
from app.domains.auth.router import router
from app.domains.auth.schemas import TokenPayload, UserCreate, UserResponse, UserUpdate
from app.domains.auth.service import AuthService

__all__ = [
    "User",
    "UserRole",
    "UserResponse",
    "UserCreate",
    "UserUpdate",
    "TokenPayload",
    "UserRepository",
    "AuthService",
    "get_current_user",
    "require_role",
    "router",
]
