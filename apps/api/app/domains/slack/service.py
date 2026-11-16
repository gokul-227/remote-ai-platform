"""
/rap orchestration: identity, confirmation, running a command, audit.

Slack wants an answer within 3 seconds. `prepare` answers everything that is
quick (help, link, not authorised, confirmation prompts) inline and returns
None for real work, which `dispatch` hands to Celery (`slack.run_command`) or,
when the broker is unreachable, to a task on this process. `run` then posts
the result to the response_url.
"""

import asyncio
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import database
from app.core.audit import audit_channel, record_audit_event
from app.core.logging import get_logger
from app.domains.slack import commands, identity
from app.domains.slack.api import ApiError, StaffApi
from app.domains.slack.security import confirm_token
from app.services import slack

logger = get_logger(__name__)

NOT_AUTHORISED = (
    ":no_entry: Not authorised. `/rap` is for staff only. Staff: generate a link code in the "
    "console (Platform › Integrations › Slack), then run `/rap link <code>`."
)
TASK_NAME = "slack.run_command"
_background: set[asyncio.Task[Any]] = set()


def ephemeral(text: str, **extra: Any) -> dict[str, Any]:
    return {"response_type": "ephemeral", "text": text[:3900], **extra}


def confirm_message(slack_user_id: str, text: str, cmd: commands.Command) -> dict[str, Any]:
    token = confirm_token(slack_user_id, text)
    prompt = f":warning: Confirm `/rap {text}`\n_{cmd.help}_"
    return ephemeral(
        prompt,
        blocks=[
            {"type": "section", "text": {"type": "mrkdwn", "text": prompt}},
            {
                "type": "actions",
                "elements": [
                    slack.button("Confirm", "rap_confirm", token, "danger"),
                    slack.button("Cancel", "rap_cancel", "cancel"),
                ],
            },
        ],
    )


async def _audit(db: AsyncSession, user_id: Any, action: str, payload: dict[str, Any]) -> None:
    token = audit_channel.set("slack")
    try:
        await record_audit_event(
            db, action, "slack", payload.get("slack_user"), user_id, "ADMIN", payload
        )
    finally:
        audit_channel.reset(token)


def _denied(slack_user_id: str, text: str) -> None:
    slack.notify(
        "security",
        ":no_entry: /rap refused: Slack user is not linked to active staff",
        dedup_key=f"slack-denied:{slack_user_id}",
        fields={"slack user": slack_user_id, "command": text.split(" ", 1)[0][:40]},
    )


async def prepare(
    db: AsyncSession,
    slack_user_id: str,
    team_id: str,
    username: str | None,
    text: str,
) -> dict[str, Any] | None:
    """An immediate answer, or None when the command should run in the background."""
    words = commands.tokenize(text)
    head = words[0].lower() if words else "help"
    if head == "help":
        return ephemeral(commands.help_text(" ".join(words[1:])))
    if head == "link":
        if len(words) < 2:
            return ephemeral("Usage: `/rap link <code>` (code from the staff console).")
        user = await identity.redeem(db, words[1], slack_user_id, team_id, username)
        if user is None:
            _denied(slack_user_id, "link")
            return ephemeral(
                ":x: That code is not valid or has expired. Generate a new one in the console."
            )
        await _audit(
            db, user.id, "slack.identity.link", {"slack_user": slack_user_id, "team": team_id}
        )
        return ephemeral(f":link: Linked to staff account {user.email}. Try `/rap status`.")
    user = await identity.resolve(db, slack_user_id, team_id)
    if user is None:
        _denied(slack_user_id, text)
        return ephemeral(NOT_AUTHORISED)
    if head == "whoami":
        return ephemeral(f"You act as *{user.email}* (staff).")
    if head == "unlink":
        await identity.unlink(db, slack_user_id)
        await _audit(db, user.id, "slack.identity.unlink", {"slack_user": slack_user_id})
        return ephemeral(":broken_chain: Unlinked. Link again with a new console code.")
    cmd, args = commands.parse(text)
    if cmd is None:
        return ephemeral(
            f"Unknown command `{head}`.\n" + commands.help_text(head if head in _modules() else "")
        )
    if len(args) < cmd.min_args:
        return ephemeral(f"Usage: `/rap {cmd.name} {cmd.usage}`")
    if cmd.confirm:
        return confirm_message(slack_user_id, text.strip(), cmd)
    return None


def _modules() -> set[str]:
    return {name.split(" ")[0] for name in commands.REGISTRY}


async def execute(
    db: AsyncSession, slack_user_id: str, team_id: str, text: str, *, confirmed: bool = False
) -> dict[str, Any]:
    """Run one command as the linked staff member. Always returns a Slack message."""
    user = await identity.resolve(db, slack_user_id, team_id)
    if user is None:
        _denied(slack_user_id, text)
        return ephemeral(NOT_AUTHORISED)
    await db.commit()  # release the session before the in-process API calls
    cmd, args = commands.parse(text)
    if cmd is None:
        return ephemeral(commands.help_text())
    if cmd.confirm and not confirmed:
        return confirm_message(slack_user_id, text.strip(), cmd)
    if len(args) < cmd.min_args:
        return ephemeral(f"Usage: `/rap {cmd.name} {cmd.usage}`")
    ctx = commands.Ctx(StaffApi(user.id), slack_user_id, user.id, user.email or "")
    outcome = "ok"
    try:
        reply = await cmd.handler(ctx, args)
    except commands.UsageError as exc:
        outcome, reply = (
            "usage",
            f":information_source: {exc}\nUsage: `/rap {cmd.name} {cmd.usage}`",
        )
    except ApiError as exc:
        outcome = f"http {exc.status}"
        reply = f":x: {exc.detail}" if exc.status != 403 else f":no_entry: {exc.detail}"
    except Exception as exc:  # never leave Slack without an answer
        logger.warning("Slack command failed", command=cmd.name, error=type(exc).__name__)
        outcome, reply = (
            "error",
            f":x: `/rap {cmd.name}` failed ({type(exc).__name__}). Try the console.",
        )
    await _audit(
        db,
        user.id,
        "slack.command",
        {
            "slack_user": slack_user_id,
            "command": cmd.name,
            "text": text[:300],
            "confirmed": confirmed,
            "status": outcome,
        },
    )
    await db.commit()
    return ephemeral(reply)


async def run(
    slack_user_id: str,
    team_id: str,
    text: str,
    response_url: str,
    *,
    confirmed: bool = False,
    replace_original: bool = False,
    in_channel: bool = False,
) -> dict[str, Any]:
    """Background half: execute, then answer through response_url."""
    async with database.AsyncSessionFactory() as db:
        message = await execute(db, slack_user_id, team_id, text, confirmed=confirmed)
    if replace_original:
        message["replace_original"] = True
    if in_channel:
        message["response_type"] = "in_channel"
        message["replace_original"] = False
    await slack.respond(response_url, message)
    return message


def _send_to_celery(kwargs: dict[str, Any]) -> None:
    from app.worker.celery_app import celery_app

    celery_app.send_task(TASK_NAME, kwargs=kwargs, queue="default", retry=False)


async def dispatch(**kwargs: Any) -> None:
    """Queue `run` on Celery; fall back to this process if the broker is down."""
    try:
        await asyncio.wait_for(asyncio.to_thread(_send_to_celery, kwargs), timeout=1.5)
        return
    except Exception as exc:
        logger.warning("Slack command not queued; running in-process", error=type(exc).__name__)
    task = asyncio.get_running_loop().create_task(run(**kwargs))
    _background.add(task)
    task.add_done_callback(_background.discard)


async def drain() -> None:
    if _background:
        await asyncio.gather(*list(_background), return_exceptions=True)


async def acknowledge(
    db: AsyncSession, slack_user_id: str, team_id: str, response_url: str
) -> None:
    user = await identity.resolve(db, slack_user_id, team_id)
    if user is None:
        await slack.respond(response_url, ephemeral(NOT_AUTHORISED, replace_original=False))
        return
    await _audit(db, user.id, "slack.alert.ack", {"slack_user": slack_user_id})
    await db.commit()
    await slack.respond(
        response_url,
        {
            "response_type": "in_channel",
            "replace_original": False,
            "text": f":eyes: Acknowledged by <@{slack_user_id}>",
        },
    )
