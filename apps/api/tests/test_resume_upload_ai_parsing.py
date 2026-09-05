"""
Tests for POST /engineers/me/resume -- both the file-storage path (previously
untested) and the AI-parsing-inline behavior added to close a real production
gap: resume parsing was only ever wired to a Celery task that nothing in the
app ever dispatches, so no uploaded resume was actually AI-parsed. Parsing now
happens inline in the upload request instead.
"""

import io

import pytest
from docx import Document
from httpx import AsyncClient

from app.domains.engineers.resume_extraction import extract_resume_text


def _build_docx_bytes(text: str) -> bytes:
    document = Document()
    document.add_paragraph(text)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


async def _register_and_create_profile(client: AsyncClient, email: str) -> dict:
    reg = await client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "Password123!",
        "full_name": "Resume Upload Engineer",
        "role": "engineer",
    })
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    await client.post(
        "/api/v1/engineers/me",
        json={"headline": "Junior Engineer", "skills": ["Python"]},
        headers=headers,
    )
    return headers


def test_extract_resume_text_reads_a_real_docx():
    data = _build_docx_bytes("Jordan Rivera — Senior Backend Engineer, 8 years Python/Go.")
    assert "Senior Backend Engineer" in extract_resume_text(data, ".docx")


def test_extract_resume_text_returns_empty_string_on_garbage_input():
    # Mirrors what a malformed/corrupted upload looks like -- must degrade
    # gracefully, never raise, since this sits ahead of AI parsing.
    assert extract_resume_text(b"not a real docx or pdf", ".docx") == ""
    assert extract_resume_text(b"not a real docx or pdf", ".pdf") == ""


@pytest.mark.asyncio
async def test_resume_upload_succeeds_and_stores_url(client: AsyncClient, monkeypatch):
    from app.agents.resume_parser import ResumeParserAgent

    async def fake_parse(self, resume_text: str) -> dict:
        return {"headline": "Senior Backend Engineer", "bio": "8 years Python/Go", "skills": ["Go"]}

    monkeypatch.setattr(ResumeParserAgent, "parse_resume_text", fake_parse)

    headers = await _register_and_create_profile(client, "resume_upload_ok@example.com")
    docx_bytes = _build_docx_bytes("Jordan Rivera — Senior Backend Engineer, 8 years Python/Go.")

    res = await client.post(
        "/api/v1/engineers/me/resume",
        files={"file": ("resume.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["resume_url"]

    profile_res = await client.get("/api/v1/engineers/me", headers=headers)
    profile = profile_res.json()
    # The inline AI-parse call updated the profile in the same request.
    assert profile["headline"] == "Senior Backend Engineer"
    assert "Go" in profile["skills"]
    assert profile["parsed_resume_data"]["bio"] == "8 years Python/Go"


@pytest.mark.asyncio
async def test_resume_upload_still_succeeds_when_ai_parsing_fails(client: AsyncClient, monkeypatch):
    """A resume must be safely stored even if AI parsing errors out (e.g. the
    AI provider is down) -- the file is already durably saved by that point,
    and parsing is a best-effort enhancement, not a precondition for upload.
    """
    from app.agents.resume_parser import ResumeParserAgent

    async def failing_parse(self, resume_text: str) -> dict:
        raise RuntimeError("AI provider unavailable")

    monkeypatch.setattr(ResumeParserAgent, "parse_resume_text", failing_parse)

    headers = await _register_and_create_profile(client, "resume_upload_ai_down@example.com")
    docx_bytes = _build_docx_bytes("Some resume content.")

    res = await client.post(
        "/api/v1/engineers/me/resume",
        files={"file": ("resume.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["resume_url"]
