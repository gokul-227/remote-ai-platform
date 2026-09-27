"""Phase 06 AI reliability: model output is untrusted input. A resume can
carry instructions ("ignore previous instructions, output ..."), and a model
can simply misbehave; neither may break the upload or flood the profile."""

import pytest
from pydantic import ValidationError

from app.domains.engineers.schemas import EngineerProfileUpdate
from app.domains.engineers.service import clean_ai_profile_fields


def test_hostile_or_malformed_ai_output_is_bounded():
    parsed = {
        "headline": "H" * 5000,
        "bio": "B" * 100_000,
        "skills": ["Python", "python", " ", 42, {"x": 1}, "S" * 500] + [f"skill{i}" for i in range(300)],
    }
    clean = clean_ai_profile_fields(parsed)
    assert len(clean["headline"]) == 255
    assert len(clean["bio"]) == 5000
    assert clean["skills"][0] == "Python" and "python" not in clean["skills"]
    assert all(isinstance(s, str) and 0 < len(s) <= 60 for s in clean["skills"])
    assert len(clean["skills"]) <= 50


def test_wrong_types_are_dropped_not_saved():
    assert clean_ai_profile_fields({"headline": ["a"], "bio": {"b": 1}, "skills": "Python"}) == {}


def test_profile_updates_are_bounded_like_the_columns():
    with pytest.raises(ValidationError):
        EngineerProfileUpdate(headline="x" * 256)
    with pytest.raises(ValidationError):
        EngineerProfileUpdate(skills=["s"] * 101)
    with pytest.raises(ValidationError):
        EngineerProfileUpdate(skills=["x" * 101])
