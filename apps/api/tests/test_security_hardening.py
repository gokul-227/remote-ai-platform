import uuid
from types import SimpleNamespace

import pytest

from app.core.security import build_private_resume_object_name, validate_resume_upload
from app.domains.engineers.service import EngineerService


def test_resume_validation_rejects_traversal_and_invalid_content():
    with pytest.raises(ValueError):
        validate_resume_upload("../../resume.pdf", "application/pdf", b"not-a-pdf", 1024)

    assert validate_resume_upload("resume.pdf", "application/pdf", b"%PDF-1.7 body", 1024) == ".pdf"


def test_resume_validation_rejects_oversized_file():
    """A file over the configured max must be rejected before it's ever
    uploaded to object storage -- otherwise an attacker can exhaust storage
    with a handful of huge "resumes"."""
    oversized = b"%PDF-1.7 " + b"A" * 2048
    with pytest.raises(ValueError):
        validate_resume_upload("resume.pdf", "application/pdf", oversized, max_bytes=1024)


def test_resume_validation_rejects_empty_file():
    with pytest.raises(ValueError):
        validate_resume_upload("resume.pdf", "application/pdf", b"", max_bytes=1024)


def test_resume_validation_rejects_content_type_mismatch_with_extension():
    """A .docx filename whose bytes are actually a PDF (or vice versa) must
    be rejected -- trusting the filename/extension alone would let an
    attacker disguise arbitrary content as a "resume"."""
    with pytest.raises(ValueError):
        validate_resume_upload(
            "resume.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            b"%PDF-1.7 this is actually a PDF",
            max_bytes=1024,
        )
    with pytest.raises(ValueError):
        validate_resume_upload(
            "resume.pdf",
            "application/pdf",
            b"PK\x03\x04 this is actually a zip/docx",
            max_bytes=1024,
        )


def test_resume_validation_rejects_disguised_executable():
    """Magic-byte check must reject content that doesn't match either
    allowed format even when filename/extension/content-type all claim PDF."""
    with pytest.raises(ValueError):
        validate_resume_upload("resume.pdf", "application/pdf", b"MZ\x90\x00fake-exe-payload", max_bytes=1024)


def test_resume_object_name_is_private_and_randomized():
    user_id = uuid.uuid4()
    first = build_private_resume_object_name(user_id, ".pdf")
    second = build_private_resume_object_name(user_id, ".pdf")
    assert first.startswith(f"resumes/{user_id}/")
    assert first.endswith(".pdf")
    assert first != second


class _FakeDB:
    async def flush(self):
        return None


class _FakeRepo:
    def __init__(self, profile):
        self.db = _FakeDB()
        self._profile = profile

    async def get_by_user_id(self, user_id):
        return self._profile


class _FakeStorage:
    async def upload_file(self, bucket_name, object_name, data, content_type):
        return f"http://minio.local/{bucket_name}/{object_name}"


class _FakeUploadFile:
    def __init__(self, filename, content_type, data):
        self.filename = filename
        self.content_type = content_type
        self._data = data

    async def read(self):
        return self._data


@pytest.mark.asyncio
async def test_upload_resume_does_not_log_the_resume_url(monkeypatch):
    """The resume object key embeds an unguessable secret token that is the
    only thing gating access to a private-bucket object -- logging the full
    resume_url would leak that capability secret into log aggregation
    systems, which are typically readable by a broader audience than the
    application's own authorization checks allow. Regression test for the
    fix in EngineerService.upload_resume.

    extract_resume_text is stubbed to return "" so this test exercises only
    the upload/logging path, not the inline AI-parse step (covered by
    test_ai_providers.py's resume-parser tests).
    """
    monkeypatch.setattr("app.domains.engineers.service.extract_resume_text", lambda data, suffix: "")

    profile = SimpleNamespace(resume_url=None)
    service = EngineerService(_FakeRepo(profile))
    service.storage = _FakeStorage()

    captured: dict = {}

    def fake_info(msg, **kwargs):
        captured.setdefault("calls", []).append((msg, kwargs))

    monkeypatch.setattr("app.domains.engineers.service.logger.info", fake_info)

    file = _FakeUploadFile("resume.pdf", "application/pdf", b"%PDF-1.7 body")
    resume_url = await service.upload_resume(uuid.uuid4(), file)

    assert resume_url
    assert captured.get("calls"), "expected upload_resume to log something"
    for _msg, kwargs in captured["calls"]:
        logged_values = " ".join(str(v) for v in kwargs.values())
        assert resume_url not in logged_values
        assert "url" not in kwargs
