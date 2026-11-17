"""
Slack endpoints.

    POST /slack/commands       /rap slash command (form-encoded, signed by Slack)
    POST /slack/interactions   Block Kit buttons (confirm, cancel, alert actions)
    POST /admin/slack/link-code       staff console: one-time code for `/rap link`
    GET  /admin/slack/identities      staff console: my linked Slack accounts
    DELETE /admin/slack/identities/{id}

Both Slack endpoints verify X-Slack-Signature with SLACK_SIGNING_SECRET and a
5-minute timestamp window before reading anything.
"""

import json
import uuid
from datetime import datetime
from typing import Any
from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit_event
from app.core.database import get_db
from app.domains.auth.dependencies import require_role
from app.domains.auth.models import User, UserRole
from app.domains.slack import identity, security, service
from app.domains.slack.models import SlackIdentity
from app.services import slack

router = APIRouter(prefix="/slack", tags=["Slack"])
admin_router = APIRouter(prefix="/admin/slack", tags=["Admin Slack"])
staff = require_role(UserRole.ADMIN)


async def _verified_body(request: Request) -> bytes:
    body = await request.body()
    if not security.verify(
        body,
        request.headers.get("X-Slack-Request-Timestamp"),
        request.headers.get("X-Slack-Signature"),
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Slack signature")
    return body


def _form(body: bytes) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(body.decode("utf-8", "replace")).items()}


@router.post("/commands", include_in_schema=False)
async def slash_command(request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    form = _form(await _verified_body(request))
    slack_user = form.get("user_id", "")
    team = form.get("team_id", "")
    text = form.get("text", "").strip()
    answer = await service.prepare(db, slack_user, team, form.get("user_name"), text)
    if answer is not None:
        return answer
    await service.dispatch(
        slack_user_id=slack_user, team_id=team, text=text, response_url=form.get("response_url", "")
    )
    return service.ephemeral(f":hourglass_flowing_sand: Working on `/rap {text[:80]}`…")


@router.post("/interactions", include_in_schema=False)
async def interaction(request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    form = _form(await _verified_body(request))
    try:
        payload = json.loads(form.get("payload", "{}"))
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "Bad payload") from exc
    if payload.get("type") != "block_actions" or not payload.get("actions"):
        return {}
    action = payload["actions"][0]
    action_id = str(action.get("action_id", ""))
    value = str(action.get("value", ""))
    slack_user = str((payload.get("user") or {}).get("id", ""))
    team = str(
        (payload.get("team") or {}).get("id", "") or (payload.get("user") or {}).get("team_id", "")
    )
    response_url = str(payload.get("response_url", ""))

    if action_id == "rap_cancel":
        await slack.respond(response_url, {"replace_original": True, "text": "Cancelled."})
        return {}
    if action_id == "rap_confirm":
        text = security.read_confirm_token(value, slack_user)
        if text is None:
            await slack.respond(
                response_url,
                {
                    "replace_original": True,
                    "text": ":x: This confirmation expired or is not yours. Run the command again.",
                },
            )
            return {}
        await slack.respond(
            response_url,
            {
                "replace_original": True,
                "text": f":hourglass_flowing_sand: Running `/rap {text[:80]}`…",
            },
        )
        await service.dispatch(
            slack_user_id=slack_user,
            team_id=team,
            text=text,
            response_url=response_url,
            confirmed=True,
            replace_original=True,
        )
        return {}
    if action_id == "rap_alert" or action_id.startswith("rap_alert:"):
        if value == "ack":
            await service.acknowledge(db, slack_user, team, response_url)
            return {}
        if value.startswith("cmd:"):
            text = value[4:]
            answer = await service.prepare(db, slack_user, team, None, text)
            if answer is not None:  # not authorised, or a confirmation prompt
                answer["replace_original"] = False
                await slack.respond(response_url, answer)
                return {}
            await service.dispatch(
                slack_user_id=slack_user,
                team_id=team,
                text=text,
                response_url=response_url,
                in_channel=True,
            )
    return {}


# ── staff console: linking ────────────────────────────────────────────────


class LinkCodeOut(BaseModel):
    code: str
    expires_at: datetime
    command: str


class SlackIdentityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    slack_user_id: str
    slack_team_id: str
    slack_username: str | None
    created_at: datetime
    last_used_at: datetime | None


@admin_router.post("/link-code", response_model=LinkCodeOut, status_code=201)
async def link_code(
    request: Request, admin: User = Depends(staff), db: AsyncSession = Depends(get_db)
) -> LinkCodeOut:
    """One-time code (valid SLACK_LINK_CODE_MINUTES) to run as `/rap link <code>` in Slack."""
    code, expires = await identity.create_link_code(db, admin)
    await record_audit_event(
        db, "slack.link_code.create", "user", str(admin.id), admin.id, admin.role.value, {}, request
    )
    return LinkCodeOut(code=code, expires_at=expires, command=f"/rap link {code}")


@admin_router.get("/identities", response_model=list[SlackIdentityOut])
async def my_identities(
    admin: User = Depends(staff), db: AsyncSession = Depends(get_db)
) -> list[SlackIdentity]:
    return await identity.identities_of(db, admin.id)


@admin_router.delete("/identities/{identity_id}", status_code=204)
async def unlink_identity(
    identity_id: uuid.UUID,
    request: Request,
    admin: User = Depends(staff),
    db: AsyncSession = Depends(get_db),
) -> None:
    row = await db.get(SlackIdentity, identity_id)
    if row is None or row.user_id != admin.id:
        raise HTTPException(404, "Not found")
    await identity.unlink(db, row.slack_user_id)
    await record_audit_event(
        db,
        "slack.identity.unlink",
        "slack",
        row.slack_user_id,
        admin.id,
        admin.role.value,
        {},
        request,
    )
