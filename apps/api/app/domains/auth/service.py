"""
Auth Service — self-issued JWT validation and Keycloak user sync.

NOTE: verify_token() validates tokens this app issues itself (signed with the
app's local JWT_SECRET_KEY, HS256), not tokens signed by a Keycloak realm's own
RS256 key. There is no JWKS fetch or RS256 verification anywhere in this file —
a real Keycloak-issued token would fail here. Keycloak is used for identity
provisioning/sync (see get_or_create_user_from_token, sync_keycloak_user), not
for cryptographic token verification.
"""

from jose import JWTError, jwt

from app.core.config import settings
from app.core.exceptions import AuthenticationError
from app.core.logging import get_logger
from app.domains.auth.models import User, UserRole
from app.domains.auth.repository import UserRepository
from app.domains.auth.schemas import TokenPayload, UserCreate

logger = get_logger("auth.service")


class AuthService:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    async def verify_token(self, token: str) -> TokenPayload:
        """
        Decode and validate a bearer token issued by this app's own /auth/login
        or /auth/register endpoints (HS256, signed with JWT_SECRET_KEY). Does
        NOT verify Keycloak-signed tokens — no JWKS/RS256 check is performed.
        """
        try:
            claims = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
            unverified_claims = claims

            # Keycloak JWT payload parsing
            sub = unverified_claims.get("sub")
            if not sub:
                raise AuthenticationError("Invalid token: missing subject (sub)")

            email = (
                unverified_claims.get("email")
                or unverified_claims.get("preferred_username")
                or f"{sub}@remoteaiplatform.local"
            )
            name = (
                unverified_claims.get("name")
                or unverified_claims.get("preferred_username")
                or email.split("@")[0]
            )

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
                v=unverified_claims.get("v"),
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

        # Map Keycloak roles to Remote AI Platform user roles
        role = UserRole.ENGINEER
        if "admin" in payload.roles or "ADMIN" in payload.roles:
            role = UserRole.ADMIN
        elif "company" in payload.roles or "COMPANY" in payload.roles:
            role = UserRole.COMPANY

        # Create new user record
        user_create = UserCreate(
            keycloak_id=payload.sub,
            email=payload.email or f"{payload.sub}@remoteaiplatform.local",
            full_name=payload.name or "Remote AI Platform User",
            role=role,
            is_active=True,
        )
        return await self.user_repo.create(user_create)

    def get_login_url(self, redirect_uri: str = "http://localhost:3000/auth/callback") -> str:
        """Generate Keycloak login URL for OIDC frontend flow."""
        return (
            f"{settings.KEYCLOAK_PUBLIC_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/auth"
            f"?client_id={settings.KEYCLOAK_WEB_CLIENT_ID}"
            f"&response_type=code"
            f"&scope=openid+profile+email"
            f"&redirect_uri={redirect_uri}"
        )

    def get_logout_url(self, redirect_uri: str = "http://localhost:3000") -> str:
        """Generate Keycloak logout URL."""
        return (
            f"{settings.KEYCLOAK_PUBLIC_URL}/realms/{settings.KEYCLOAK_REALM}/protocol/openid-connect/logout"
            f"?client_id={settings.KEYCLOAK_WEB_CLIENT_ID}"
            f"&post_logout_redirect_uri={redirect_uri}"
        )
