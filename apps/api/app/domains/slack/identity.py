"""Linking a Slack user to a staff account, and resolving one per request."""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domains.auth.models import User, UserRole
from app.domains.slack.models import SlackIdentity, SlackLinkCode

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(ts: datetime) -> datetime:
    return ts if ts.tzinfo else ts.replace(tzinfo=UTC)  # SQLite drops the offset


def _hash(code: str) -> str:
    return hashlib.sha256(code.strip().upper().replace("-", "").encode()).hexdigest()


def is_staff(user: User | None) -> bool:
    return user is not None and user.is_active and user.role == UserRole.ADMIN


async def create_link_code(db: AsyncSession, user: User) -> tuple[str, datetime]:
    """A fresh one-time code for `user`; any older unused codes of theirs are dropped."""
    await db.execute(
        delete(SlackLinkCode).where(
            SlackLinkCode.user_id == user.id, SlackLinkCode.used_at.is_(None)
        )
    )
    raw = "".join(secrets.choice(_ALPHABET) for _ in range(8))
    expires = _now() + timedelta(minutes=settings.SLACK_LINK_CODE_MINUTES)
    db.add(SlackLinkCode(code_hash=_hash(raw), user_id=user.id, expires_at=expires))
    await db.flush()
    return f"{raw[:4]}-{raw[4:]}", expires


async def redeem(
    db: AsyncSession, code: str, slack_user_id: str, team_id: str, username: str | None
) -> User | None:
    """Link the Slack user to the code's staff account. None if the code is not usable."""
    row = await db.scalar(select(SlackLinkCode).where(SlackLinkCode.code_hash == _hash(code)))
    if row is None or row.used_at is not None or _aware(row.expires_at) < _now():
        return None
    user = await db.get(User, row.user_id)
    if not is_staff(user):
        return None
    row.used_at = _now()
    existing = await db.scalar(
        select(SlackIdentity).where(SlackIdentity.slack_user_id == slack_user_id)
    )
    if existing is None:
        db.add(
            SlackIdentity(
                slack_user_id=slack_user_id,
                slack_team_id=team_id,
                slack_username=username,
                user_id=row.user_id,
            )
        )
    else:
        existing.user_id = row.user_id
        existing.slack_team_id = team_id
        existing.slack_username = username
    await db.flush()
    return user


async def resolve(db: AsyncSession, slack_user_id: str, team_id: str | None = None) -> User | None:
    """The active staff account this Slack user is linked to, else None."""
    ident = await db.scalar(
        select(SlackIdentity).where(SlackIdentity.slack_user_id == slack_user_id)
    )
    if ident is None:
        return None
    if team_id and ident.slack_team_id and ident.slack_team_id != team_id:
        return None
    user = await db.get(User, ident.user_id)
    if not is_staff(user):
        return None
    ident.last_used_at = _now()
    await db.flush()
    return user


async def unlink(db: AsyncSession, slack_user_id: str) -> bool:
    res = await db.execute(
        delete(SlackIdentity).where(SlackIdentity.slack_user_id == slack_user_id)
    )
    await db.flush()
    return bool(getattr(res, "rowcount", 0))


async def identities_of(db: AsyncSession, user_id: uuid.UUID) -> list[SlackIdentity]:
    return list(
        (await db.execute(select(SlackIdentity).where(SlackIdentity.user_id == user_id)))
        .scalars()
        .all()
    )
