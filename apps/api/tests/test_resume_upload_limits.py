"""Phase 06: resume parsing cannot be used to exhaust memory or CPU."""

import io
import zipfile

import pytest

from app.core.security import validate_resume_upload

MAX = 5 * 1024 * 1024
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _zip(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in entries.items():
            z.writestr(name, data)
    return buf.getvalue()


def test_docx_zip_bomb_is_rejected_before_parsing():
    bomb = _zip({"word/document.xml": b"<w/>", "word/media/huge.bin": b"\0" * (60 * 1024 * 1024)})
    assert len(bomb) < MAX  # small on the wire
    with pytest.raises(ValueError, match="too large"):
        validate_resume_upload("cv.docx", DOCX, bomb, MAX)


def test_zip_that_is_not_a_word_document_is_rejected():
    with pytest.raises(ValueError):
        validate_resume_upload("cv.docx", DOCX, _zip({"hello.txt": b"hi"}), MAX)
    with pytest.raises(ValueError):
        validate_resume_upload("cv.docx", DOCX, b"PK\x03\x04 not really a zip", MAX)


def test_normal_docx_passes():
    assert validate_resume_upload("cv.docx", DOCX, _zip({"word/document.xml": b"<w/>" * 100}), MAX) == ".docx"


def test_pdf_text_extraction_reads_a_bounded_number_of_pages(monkeypatch):
    from app.domains.engineers import resume_extraction

    read: list[int] = []

    class Page:
        def __init__(self, i):
            self.i = i

        def extract_text(self):
            read.append(self.i)
            return f"page {self.i}"

    class FakeReader:
        def __init__(self, _):
            self.pages = [Page(i) for i in range(5000)]

    monkeypatch.setattr(resume_extraction, "PdfReader", FakeReader)
    text = resume_extraction.extract_resume_text(b"%PDF-1.4", ".pdf")
    assert len(read) == resume_extraction.MAX_PDF_PAGES
    assert text.startswith("page 0")
