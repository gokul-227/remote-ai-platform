"""Search-engine notifications after an import: Google Indexing API and IndexNow. No network."""

import base64
import json
import uuid

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

import app.services.search.indexing as ix
from app.core.config import settings


@pytest.fixture
def google(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    creds = {
        "client_email": "bot@x.iam.gserviceaccount.com",
        "private_key": pem,
        "private_key_id": "k1",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
    monkeypatch.setattr(
        settings,
        "GOOGLE_INDEXING_CREDENTIALS_B64",
        base64.b64encode(json.dumps(creds).encode()).decode(),
    )
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "APP_URL", "https://remoteaiplatform.com")
    monkeypatch.setattr(settings, "GOOGLE_INDEXING_PER_RUN", 3)
    seen: dict[str, list] = {"published": [], "indexnow": []}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth2.googleapis.com":
            assertion = dict(x.split("=", 1) for x in request.content.decode().split("&"))[
                "assertion"
            ]
            claims = jwt.decode(
                assertion, key.public_key(), algorithms=["RS256"], audience=creds["token_uri"]
            )
            assert claims["scope"] == ix.GOOGLE_SCOPE
            return httpx.Response(200, json={"access_token": "tok"})
        if request.url.host == "indexing.googleapis.com":
            assert request.headers["Authorization"] == "Bearer tok"
            seen["published"].append(json.loads(request.content)["url"])
            return httpx.Response(429 if len(seen["published"]) > 2 else 200)
        seen["indexnow"].append(json.loads(request.content))
        return httpx.Response(202)

    real = httpx.AsyncClient
    monkeypatch.setattr(
        ix.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw)
    )
    return seen


@pytest.mark.asyncio
async def test_new_jobs_go_to_google_within_quota_and_to_indexnow(google):
    ids = [uuid.uuid4() for _ in range(5)]
    sent = await ix.notify_new_jobs(ids)
    # Third Google call answered 429 (quota): it stops there and counts only the accepted ones.
    assert sent == {"google": 2, "indexnow": 5}
    assert google["published"][0] == f"https://remoteaiplatform.com/jobs/{ids[0]}"
    body = google["indexnow"][0]
    assert body["host"] == "remoteaiplatform.com"
    assert body["keyLocation"] == "https://remoteaiplatform.com/indexnow.txt"
    assert len(body["urlList"]) == 5


@pytest.mark.asyncio
async def test_nothing_is_sent_outside_production(google, monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "staging")
    assert await ix.notify_new_jobs([uuid.uuid4()]) == {"google": 0, "indexnow": 0}
    assert google["published"] == []
    assert google["indexnow"] == []
