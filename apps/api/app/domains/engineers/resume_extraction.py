"""Plain-text extraction from an uploaded resume file, ahead of AI parsing.

Kept separate from resume_parser.py (the AI agent) -- this module has no AI
dependency, just turns PDF/DOCX bytes into text a prompt can consume.
"""

import io

from docx import Document
from pypdf import PdfReader

from app.core.logging import get_logger

logger = get_logger("engineers.resume_extraction")


def extract_resume_text(data: bytes, suffix: str) -> str:
    """Extract plain text from resume file bytes. Returns "" on any failure
    (a malformed or encrypted PDF, for instance) rather than raising --
    a text-extraction failure must never block the resume upload itself,
    only mean AI parsing has nothing to work with.
    """
    try:
        if suffix == ".pdf":
            reader = PdfReader(io.BytesIO(data))
            return "\n".join(page.extract_text() or "" for page in reader.pages).strip()
        if suffix == ".docx":
            document = Document(io.BytesIO(data))
            return "\n".join(paragraph.text for paragraph in document.paragraphs).strip()
    except Exception as exc:  # deliberately broad -- see docstring
        logger.warning("Resume text extraction failed", suffix=suffix, error=str(exc))
    return ""
