"""
Call the staff API in-process as a linked staff member.

Every /rap command goes through the same /api/v1/admin/* endpoints the console
uses, so validation, staff-role scope (admin/staff.py) and audit rows are
identical. The caller is identified by an ASGI scope key that only this module
sets (see SLACK_ACTOR_SCOPE_KEY in auth/dependencies.py); audit rows written
during the call carry channel=slack.
"""

import uuid
from typing import Any

import httpx

from app.core.audit import audit_channel
from app.domains.auth.dependencies import SLACK_ACTOR_SCOPE_KEY

PREFIX = "/api/v1"


class ApiError(Exception):
    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _detail(res: httpx.Response) -> str:
    try:
        body = res.json()
    except ValueError:
        return res.text[:300] or f"HTTP {res.status_code}"
    detail = body.get("detail") if isinstance(body, dict) else None
    if isinstance(detail, list):  # validation errors
        return "; ".join(str(d.get("msg", d)) for d in detail[:3])
    return str(detail or body)[:300]


class StaffApi:
    def __init__(self, user_id: uuid.UUID) -> None:
        self.user_id = user_id

    def _app(self) -> Any:
        from app.main import app

        actor = str(self.user_id)

        async def as_actor(scope: dict, receive: Any, send: Any) -> None:
            if scope.get("type") == "http":
                scope = {**scope, SLACK_ACTOR_SCOPE_KEY: actor}
            await app(scope, receive, send)

        return as_actor

    async def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
    ) -> Any:
        token = audit_channel.set("slack")
        try:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=self._app()),
                base_url="http://slack.internal",
                headers={"User-Agent": "RAP Slack /rap"},
                timeout=60,
            ) as client:
                clean = {k: v for k, v in (params or {}).items() if v is not None}
                res = await client.request(method, PREFIX + path, params=clean, json=json)
        finally:
            audit_channel.reset(token)
        if res.status_code >= 400:
            raise ApiError(res.status_code, _detail(res))
        if res.status_code == 204 or not res.content:
            return None
        try:
            return res.json()
        except ValueError:
            return res.text

    async def get(self, path: str, **params: Any) -> Any:
        return await self.request("GET", path, params=params)

    async def post(self, path: str, body: Any = None, **params: Any) -> Any:
        return await self.request("POST", path, params=params, json=body)

    async def patch(self, path: str, body: Any = None) -> Any:
        return await self.request("PATCH", path, json=body)

    async def put(self, path: str, body: Any = None) -> Any:
        return await self.request("PUT", path, json=body)

    async def delete(self, path: str) -> Any:
        return await self.request("DELETE", path)
