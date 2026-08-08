import uuid

import pytest

from app.core.security import build_private_resume_object_name, validate_resume_upload


def test_resume_validation_rejects_traversal_and_invalid_content():
    with pytest.raises(ValueError):
        validate_resume_upload("../../resume.pdf", "application/pdf", b"not-a-pdf", 1024)

    assert validate_resume_upload("resume.pdf", "application/pdf", b"%PDF-1.7 body", 1024) == ".pdf"


def test_resume_object_name_is_private_and_randomized():
    user_id = uuid.uuid4()
    first = build_private_resume_object_name(user_id, ".pdf")
    second = build_private_resume_object_name(user_id, ".pdf")
    assert first.startswith(f"resumes/{user_id}/")
    assert first.endswith(".pdf")
    assert first != second
