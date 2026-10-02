"""The request session commits before the response is sent, so a client that
re-reads right after a 2xx sees its write, and a failed commit is a 500 rather
than a success already reported (read-your-writes; the flaky "Saved" E2E)."""

import httpx
import pytest
from conftest import TestingSessionLocal
from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import session_dependency


def _app(events: list[str], fail_commit: bool = False) -> FastAPI:
    app = FastAPI()
    get_session = session_dependency(TestingSessionLocal)

    @app.post("/write", status_code=201)
    async def write(db: AsyncSession = Depends(get_session)):
        real_commit = db.commit

        async def commit():
            events.append("commit")
            if fail_commit:
                raise RuntimeError("commit failed")
            await real_commit()

        db.commit = commit  # type: ignore[method-assign]
        return {"ok": True}

    @app.post("/refuse")
    async def refuse(db: AsyncSession = Depends(get_session)):
        real_rollback = db.rollback

        async def rollback():
            events.append("rollback")
            await real_rollback()

        db.rollback = rollback  # type: ignore[method-assign]
        raise HTTPException(status_code=409, detail="no")

    return app


async def _call(app: FastAPI, path: str, events: list[str]) -> int:
    status = 0

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        nonlocal status
        if message["type"] == "http.response.start":
            events.append("response")
            status = message["status"]

    scope = {"type": "http", "method": "POST", "path": path, "raw_path": path.encode(), "query_string": b"",
             "headers": [], "http_version": "1.1", "scheme": "http", "server": ("t", 80), "client": ("c", 1),
             "root_path": ""}
    try:
        await app(scope, receive, send)
    except Exception:
        if not status:
            status = 500
    return status


@pytest.mark.asyncio
async def test_commit_happens_before_the_response_starts():
    events: list[str] = []
    assert await _call(_app(events), "/write", events) == 201
    assert events.index("commit") < events.index("response")


@pytest.mark.asyncio
async def test_failed_commit_is_never_reported_as_success():
    events: list[str] = []
    status = await _call(_app(events, fail_commit=True), "/write", events)
    assert status == 500
    assert "commit" in events


@pytest.mark.asyncio
async def test_refused_request_rolls_back_before_responding():
    events: list[str] = []
    assert await _call(_app(events), "/refuse", events) == 409
    assert events.index("rollback") < events.index("response")


@pytest.mark.asyncio
async def test_real_endpoint_through_http_still_works(client: httpx.AsyncClient):
    assert (await client.get("/api/v1/jobs?limit=1")).status_code == 200
