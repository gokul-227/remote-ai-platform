"""Job data quality (go-live finding O): text repair and no invented fields."""

import pytest

from app.domains.jobs.aggregators.base import BaseAggregator as B


@pytest.mark.parametrize(
    ("raw", "clean"),
    [
        ("MecÃ¡nico Automotriz", "Mecánico Automotriz"),
        ("Softwareentwickler (m/w/d) â€“ München", "Softwareentwickler (m/w/d) – München"),
        ("It&#39;s <b>great</b>", "It's great"),
        ("Café déjà vu", "Café déjà vu"),
        # Rows already damaged by the old NFKC pass ("ó" -> "Ã3").
        ("MecÃ¡nico DiagnÃ3stico", "Mecánico Diagnóstico"),
        ("Area 51 × 10³ units", "Area 51 × 10³ units"),
    ],
)
def test_clean_text_repairs_mojibake_without_corrupting_valid_text(raw, clean):
    assert B.clean_text(raw) == clean


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("full_time", "full-time"), ("Full Time", "full-time"), ("part-time", "part-time"),
     ("Contract", "contract"), ("freelance", "freelance"), (None, "unspecified"), ("berufserfahren", "unspecified")],
)
def test_job_types_are_normalized_not_guessed(raw, expected):
    assert B.normalize_job_type(raw) == expected


def test_new_jobs_default_to_unknown_type_and_level():
    from app.domains.jobs.schemas import JobPostCreate

    job = JobPostCreate(title="Translator", description="Translate documents", company_name="Co")
    assert job.job_type == "unspecified"
    assert job.experience_level is None
    assert job.salary_period is None


@pytest.mark.asyncio
async def test_direct_job_keeps_its_salary_period(client):
    reg = await client.post("/api/v1/auth/register", json={"email": "period-co@example.com", "full_name": "Co", "role": "COMPANY"})
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    await client.post("/api/v1/companies/me", headers=headers, json={"name": "Period Co"})
    resp = await client.post("/api/v1/jobs", headers=headers, json={
        "title": "Copywriter", "description": "Write copy", "salary_min": 40, "salary_max": 40,
        "salary_period": "hour", "currency": "EUR"})
    assert resp.status_code == 201, resp.text
    assert resp.json()["salary_period"] == "hour"
