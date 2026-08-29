"""Small, reusable security validation helpers."""

import secrets
from pathlib import PurePosixPath
from uuid import UUID

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def get_password_hash(password: str) -> str:
    """Hash a plaintext password using the shared passlib context."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify a plaintext password against its hash using the shared context."""
    return pwd_context.verify(plain_password, password_hash)


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
    if suffix == ".docx" and not data.startswith(b"PK"):
        raise ValueError("DOCX resume content could not be verified")
    return suffix


def build_private_resume_object_name(user_id: UUID, suffix: str) -> str:
    return f"resumes/{user_id}/{secrets.token_urlsafe(18)}{suffix}"
