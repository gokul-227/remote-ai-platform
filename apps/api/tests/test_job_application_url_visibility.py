"""Member-only application links must not leak through shared job caches."""

import uuid

import pytest

from app.domains.jobs import list_cache
from app.domains.jobs.models import JobPost
from app.domains.jobs.service import JobService


@pytest.mark.parametrize("member_first", [False, True])
@pytest.mark.parametrize("source", ["DIRECT", "REMOTEOK"])
async def test_application_urls_by_viewer(client, auth_headers, monkeypatch, member_first, source):
    from conftest import TestingSessionLocal
    from test_job_visibility import _org

    _, company_id = await _org(client)
    job = JobPost(
        title="URL visibility role", slug=f"url-{uuid.uuid4().hex}",
        description="Public full description", company_name="Preview Company",
        company_id=company_id if source == "DIRECT" else None, location="Berlin", source=source,
        external_url="https://employer.example/apply/secret",
        ai_analysis={"summary": "Public analysis unchanged"}, is_remote=True, skills=[],
    )
    async with TestingSessionLocal() as db:
        db.add(job)
        await db.commit()

    calls = 0
    original = JobService.search_jobs

    async def counted(self, *args, **kwargs):
        nonlocal calls
        calls += 1
        return await original(self, *args, **kwargs)

    monkeypatch.setattr(JobService, "search_jobs", counted)
    list_cache.clear()
    urls = [
        "/api/v1/jobs?query=URL%20visibility&limit=100",
        f"/api/v1/jobs/{job.id}",
        "/api/v1/search?q=URL%20visibility",
    ]
    if source == "DIRECT":
        urls.append(f"/api/v1/jobs/company/{company_id}")
    viewers = [True, False, True, False] if member_first else [False, True, False, True]
    try:
        for url in urls:
            for member in viewers:
                response = await client.get(url, headers=auth_headers if member else {})
                assert response.status_code == 200, response.text
                assert response.headers["cache-control"] == "private, no-store"
                assert {"authorization", "cookie"} <= {
                    v.strip().lower() for v in response.headers["vary"].split(",")
                }
                data = response.json()
                if url.startswith("/api/v1/search"):
                    data = data["jobs"]
                if isinstance(data, list):
                    assert len(data) == 1
                    data = data[0]
                assert data["external_url"] == (job.external_url if member else None)
                for field in ("description", "ai_analysis", "title", "company_name", "location"):
                    assert data[field] == getattr(job, field)
                if url.startswith("/api/v1/jobs?"):
                    assert response.headers["x-total-count"] == "1"
        assert calls == 1
        facets = await client.get("/api/v1/jobs/facets")
        assert facets.status_code == 200
        assert facets.json()["total"] == 1
    finally:
        list_cache.clear()
