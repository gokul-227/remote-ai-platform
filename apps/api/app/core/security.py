"""Small, reusable security validation helpers."""

import io
import secrets
import zipfile
from pathlib import PurePosixPath
from uuid import UUID

ALLOWED_RESUME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
}


def validate_resume_upload(
    filename: str | None, content_type: str | None, data: bytes, max_bytes: int
) -> str:
    name = PurePosixPath(filename or "").name.lower()
    if not (name.endswith(".pdf") or name.endswith(".docx")):
        raise ValueError("File format not supported. Upload PDF or DOCX.")
    if content_type not in ALLOWED_RESUME_TYPES:
        raise ValueError("Unsupported content type")
    if not data or len(data) > max_bytes:
        raise ValueError("Resume must be non-empty and no larger than 5 MB")
    suffix = ".docx" if name.endswith(".docx") else ".pdf"
    if suffix == ".pdf" and not data.startswith(b"%PDF"):
        raise ValueError("PDF resume content could not be verified")
    if suffix == ".docx":
        _check_docx_package(data)
    return suffix


# A DOCX is a zip: a few KB can expand to gigabytes when parsed.
_DOCX_MAX_UNCOMPRESSED = 30 * 1024 * 1024
_DOCX_MAX_ENTRIES = 1000


def _check_docx_package(data: bytes) -> None:
    if not data.startswith(b"PK"):
        raise ValueError("DOCX resume content could not be verified")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as package:
            entries = package.infolist()
    except zipfile.BadZipFile as exc:
        raise ValueError("DOCX resume content could not be verified") from exc
    if not any(e.filename == "word/document.xml" for e in entries):
        raise ValueError("DOCX resume content could not be verified")
    if len(entries) > _DOCX_MAX_ENTRIES or sum(e.file_size for e in entries) > _DOCX_MAX_UNCOMPRESSED:
        raise ValueError("DOCX resume is too large once unpacked")


def build_private_resume_object_name(user_id: UUID, suffix: str) -> str:
    return f"resumes/{user_id}/{secrets.token_urlsafe(18)}{suffix}"
