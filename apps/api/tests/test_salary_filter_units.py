"""SEARCH-01: salary bounds compare like with like. Amounts without units are
refused; only jobs stated in the requested currency and period match, and a
job with an unknown period never becomes an invented USD/year match."""

import uuid

import pytest
from httpx import AsyncClient


async def _seed():
    from conftest import TestingSessionLocal

    from app.domains.jobs.models import JobPost

    def job(title, lo, hi, currency, period):
        return JobPost(id=uuid.uuid4(), title=title, slug=f"s-{uuid.uuid4().hex[:8]}", description="d",
                       company_name="C", salary_min=lo, salary_max=hi, currency=currency, salary_period=period)

    async with TestingSessionLocal() as db:
        db.add_all([
            job("Yearly USD", 90000, 120000, "USD", "year"),
            job("Hourly USD", 60, 80, "USD", "hour"),
            job("Yearly EUR", 95000, 110000, "EUR", "year"),
            job("Unknown period", 100000, 100000, "USD", None),
        ])
        await db.commit()


async def _titles(client: AsyncClient, **params) -> set[str]:
    resp = await client.get("/api/v1/jobs", params=params)
    assert resp.status_code == 200, resp.text
    return {j["title"] for j in resp.json()}


@pytest.mark.asyncio
async def test_bounds_without_units_are_refused(client: AsyncClient):
    assert (await client.get("/api/v1/jobs", params={"min_salary": 50})).status_code == 422
    resp = await client.get("/api/v1/jobs", params={"min_salary": 50, "salary_currency": "USD"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_only_same_currency_and_period_match(client: AsyncClient):
    await _seed()
    assert await _titles(client, min_salary=50, salary_currency="usd", salary_period="hour") == {"Hourly USD"}
    assert await _titles(client, min_salary=100000, salary_currency="USD", salary_period="year") == {"Yearly USD"}
    assert await _titles(client, min_salary=100000, salary_currency="EUR", salary_period="year") == {"Yearly EUR"}


@pytest.mark.asyncio
async def test_invalid_units_and_inverted_range_are_rejected(client: AsyncClient):
    bad = [
        {"min_salary": 1, "salary_currency": "DOLLARS", "salary_period": "year"},
        {"min_salary": 1, "salary_currency": "USD", "salary_period": "fortnight"},
        {"min_salary": 10, "max_salary": 5, "salary_currency": "USD", "salary_period": "year"},
    ]
    for params in bad:
        assert (await client.get("/api/v1/jobs", params=params)).status_code == 422


@pytest.mark.asyncio
async def test_no_salary_filter_still_lists_every_job(client: AsyncClient):
    await _seed()
    titles = await _titles(client, limit=100)
    assert {"Yearly USD", "Hourly USD", "Yearly EUR", "Unknown period"} <= titles
