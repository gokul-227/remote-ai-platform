"""
Auth service: maps a verified Supabase identity to this app's user record.

Identity (who you are) comes from Supabase Auth; everything else (role, name,
profile) lives in this app's own `users` table. Tokens are verified in
`supabase_auth.verify_supabase_token`; this module never issues tokens.
"""

from fastapi import HTTPException, status
from sqlalchemy import select

from app.core.logging import get_logger
from app.domains.auth.models import DeletedIdentity, User, UserIdentity, UserRole, identity_hash
from app.domains.auth.repository import UserRepository
from app.domains.auth.schemas import UserCreate
from app.domains.auth.supabase_auth import SupabaseIdentity

logger = get_logger("auth.service")


class AuthService:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    async def get_or_create_user(self, identity: SupabaseIdentity) -> User:
        """Find the user for a verified identity, creating one on first sign-in."""
        if identity.provider != "supabase":
            return await self._user_for_linked_identity(identity)
        user = await self.user_repo.get_by_auth_subject(identity.user_id)
        if user:
            return user

        # This account was deleted. Refuse every token for the subject: one
        # minted later by refreshing the old session has a later `iat` but is
        # not a new sign-in, and would otherwise silently re-create the
        # account (DATA-04). Signing up again yields a new Supabase user and
        # subject once the old one is erased.
        if (
            await self.user_repo.db.get(DeletedIdentity, identity_hash(identity.user_id))
            is not None
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="This account was deleted. Sign up again to create a new one.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if identity.email:
            user = await self.user_repo.get_by_email(identity.email)
            if user:
                if user.auth_subject or await self.user_repo.db.scalar(
                    select(UserIdentity.id).where(UserIdentity.user_id == user.id).limit(1)
                ):
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

    async def _user_for_linked_identity(self, identity: SupabaseIdentity) -> User:
        """Identity from an allow-listed extra issuer (dual validation).

        Order: an already linked (provider, subject) wins; otherwise a verified
        email matching an existing account links to it (the Supabase subject is
        never overwritten); otherwise a new account is created. An unverified
        email never links to anyone else's account.
        """
        db = self.user_repo.db
        if await db.get(DeletedIdentity, identity_hash(identity.user_id, identity.provider)):
            raise HTTPException(status_code=401, detail="This account was deleted. Sign up again.")
        linked = (
            await db.execute(
                select(UserIdentity).where(
                    UserIdentity.provider == identity.provider,
                    UserIdentity.subject == identity.user_id,
                )
            )
        ).scalar_one_or_none()
        if linked is not None:
            user = await self.user_repo.get_by_id(linked.user_id)
            if user is not None:
                return user
        user = None
        if identity.email:
            user = await self.user_repo.get_by_email(identity.email)
            if user is not None and not identity.email_verified:
                # Someone else's account must never be reachable through an
                # unverified email claim; merging is a manual support process.
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "An account with this email already exists. Verify the email with your "
                        "sign-in provider or sign in the way you did before."
                    ),
                )
        if identity.email_verified is not True:
            raise HTTPException(status_code=409, detail="Verify your email with your sign-in provider.")
        if user is None:
            user = await self.user_repo.create(
                UserCreate(
                    auth_subject=None,
                    email=identity.email
                    or f"{identity.provider}-{identity.user_id}@users.remoteaiplatform.invalid",
                    full_name="Member",
                    role=UserRole.ENGINEER,
                    is_active=True,
                )
            )
            logger.info("Account created from extra issuer", provider=identity.provider)
        else:
            logger.info(
                "Extra-issuer identity linked by verified email",
                provider=identity.provider,
                user_id=str(user.id),
            )
        db.add(
            UserIdentity(
                user_id=user.id,
                provider=identity.provider,
                subject=identity.user_id,
                email=identity.email,
            )
        )
        await db.flush()
        return user
