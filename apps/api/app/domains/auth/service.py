"""
Auth service: maps a verified Supabase identity to this app's user record.

Identity (who you are) comes from Supabase Auth; everything else (role, name,
profile) lives in this app's own `users` table. Tokens are verified in
`supabase_auth.verify_supabase_token`; this module never issues tokens.
"""

from fastapi import HTTPException, status

from app.core.logging import get_logger
from app.domains.auth.models import User, UserRole
from app.domains.auth.repository import UserRepository
from app.domains.auth.schemas import UserCreate
from app.domains.auth.supabase_auth import SupabaseIdentity

logger = get_logger("auth.service")


class AuthService:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    async def get_or_create_user(self, identity: SupabaseIdentity) -> User:
        """Find the user for a verified identity, creating one on first sign-in."""
        user = await self.user_repo.get_by_auth_subject(identity.user_id)
        if user:
            return user

        if identity.email:
            user = await self.user_repo.get_by_email(identity.email)
            if user:
                if user.auth_subject:
                    # A different identity claims this email. Supabase does not
                    # link identities whose email a provider hasn't verified, so
                    # this can be someone else: never move the account to it.
                    # Merging accounts is a verified, manual support process.
                    logger.warning(
                        "Sign-in refused: email belongs to an account with another identity",
                        user_id=str(user.id),
                    )
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=(
                            "An account with this email already exists and uses a different sign-in method. "
                            "Sign in the way you did before, or contact support to link them."
                        ),
                    )
                # Rows created before the account's first Supabase sign-in.
                user.auth_subject = identity.user_id
                await self.user_repo.db.flush()
                return user

        # Role is decided by this app (default ENGINEER, changed only through
        # its own endpoints), never read from the identity provider's token.
        return await self.user_repo.create(
            UserCreate(
                auth_subject=identity.user_id,
                email=identity.email or f"{identity.user_id}@users.remoteaiplatform.invalid",
                # Never derive a public display name from the email address;
                # the sign-up flow sets the real name right after this.
                full_name="Member",
                role=UserRole.ENGINEER,
                is_active=True,
            )
        )
