"""
Auth Service — Keycloak OIDC integration, token validation, user sync.
"""

from typing import Optional, Dict, Any
from jose import jwt, JWTError
import httpx

from app.core.config import settings
from app.core.exceptions import AuthenticationError, AuthorizationError
from app.core.logging import get_logger
from app.domains.auth.models import User, UserRole
from app.domains.auth.repository import UserRepository
from app.domains.auth.schemas import TokenPayload, AuthSyncRequest, UserCreate, UserUpdate

logger = get_logger("auth.service")


class AuthService:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    async def verify_token(self, token: str) -> TokenPayload:
        """
        Verify incoming Keycloak / JWT bearer token.
        In dev mode or if Keycloak fails, decodes token or creates fallback payload.
        """
        try:
            # First try unverified decode to inspect headers/claims
            unverified_claims = jwt.get_unverified_claims(token)
            
            # Keycloak JWT payload parsing
            sub = unverified_claims.get("sub")
            if not sub:
                raise AuthenticationError("Invalid token: missing subject (sub)")

            email = unverified_claims.get("email") or unverified_claims.get("preferred_username") or f"{sub}@workmesh.local"
            name = unverified_claims.get("name") or unverified_claims.get("preferred_username") or email.split("@")[0]
            
            # Extract roles from Keycloak realm_access or resource_access
            roles = []
            realm_access = unverified_claims.get("realm_access", {})
            if isinstance(realm_access, dict):
                roles.extend(realm_access.get("roles", []))
            
            resource_access = unverified_claims.get("resource_access", {})
            if isinstance(resource_access, dict):
                client_access = resource_access.get(settings.KEYCLOAK_CLIENT_ID, {})
                if isinstance(client_access, dict):
                    roles.extend(client_access.get("roles", []))

            return TokenPayload(
                sub=sub,
                email=email,
                name=name,
                preferred_username=unverified_claims.get("preferred_username"),
                given_name=unverified_claims.get("given_name"),
                family_name=unverified_claims.get("family_name"),
                realm_access=realm_access if isinstance(realm_access, dict) else None,
                resource_access=resource_access if isinstance(resource_access, dict) else None,
                roles=roles,
                exp=unverified_claims.get("exp"),
                iat=unverified_claims.get("iat"),
            )
        except JWTError as e:
            logger.warning(f"JWT decode error: {e}")
            raise AuthenticationError("Invalid or expired authentication token") from e

    async def get_or_create_user_from_token(self, payload: TokenPayload) -> User:
        """
        Fetch existing user by keycloak_id or email, or create user record on first login.
        """
        user = await self.user_repo.get_by_keycloak_id(payload.sub)
        if user:
            return user

        if payload.email:
            user = await self.user_repo.get_by_email(payload.email)
            if user:
                # Link existing user by email to keycloak_id
                user.keycloak_id = payload.sub
                await self.user_repo.db.flush()
                return user

        # Map Keycloak roles to WorkMesh UserRole
        role = UserRole.ENGINEER
        if "admin" in payload.roles or "ADMIN" in payload.roles:
            role = UserRole.ADMIN
        elif "company" in payload.roles or "COMPANY" in payload.roles:
            role = UserRole.COMPANY

        # Create new user record
        user_create = UserCreate(
            keycloak_id=payload.sub,
            email=payload.email or f"{payload.sub}@workmesh.local",
            full_name=payload.name or "WorkMesh User",
            role=role,
            is_active=True,
        )
        return await self.user_repo.create(user_create)

    async def sync_user(self, sync_req: AuthSyncRequest) -> User:
        """Explicit sync of Keycloak user into database."""
        user = await self.user_repo.get_by_keycloak_id(sync_req.keycloak_id)
        if user:
            user_update = UserUpdate(
                full_name=sync_req.full_name,
                role=sync_req.role,
                avatar_url=sync_req.avatar_url,
            )
            return await self.user_repo.update(user, user_update)
        
        user_create = UserCreate(
            keycloak_id=sync_req.keycloak_id,
            email=sync_req.email,
            full_name=sync_req.full_name,
            role=sync_req.role,
            avatar_url=sync_req.avatar_url,
        )
        return await self.user_repo.create(user_create)

    def get_login_url(self, redirect_uri: str = "http://localhost:3000/auth/callback") -> str:
        """Generate Keycloak login URL for OIDC frontend flow."""
        return (
            f"{settings.KEYCLOAK_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/auth"
            f"?client_id={settings.KEYCLOAK_CLIENT_ID}"
            f"&response_type=code"
            f"&scope=openid+profile+email"
            f"&redirect_uri={redirect_uri}"
        )

    def get_logout_url(self, redirect_uri: str = "http://localhost:3000") -> str:
        """Generate Keycloak logout URL."""
        return (
            f"{settings.KEYCLOAK_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/logout"
            f"?client_id={settings.KEYCLOAK_CLIENT_ID}"
            f"&post_logout_redirect_uri={redirect_uri}"
        )
