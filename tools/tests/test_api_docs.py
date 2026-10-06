"""OpenAPI export and the OpenAPI -> Postman Collection v3 pipeline, run for real
(official converter + Postman CLI) against fixture specs."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "tools"
POSTMAN_SCRIPT = TOOLS / "api_docs/postman.mjs"
API_PYTHON = ROOT / "apps/api/.venv/bin/python"

needs_node_tools = pytest.mark.skipif(
    not (TOOLS / "node_modules/.bin/postman").exists() or not shutil.which("node"),
    reason="run `npm ci --prefix tools --ignore-scripts` first",
)

BASE_SPEC = {
    "openapi": "3.1.0",
    "info": {"title": "Fixture API", "version": "1"},
    "servers": [{"url": "http://localhost:8000"}],
    "paths": {
        "/api/v1/jobs": {
            "get": {
                "tags": ["Jobs"],
                "summary": "List jobs",
                "operationId": "list_jobs",
                "parameters": [{"name": "limit", "in": "query", "schema": {"type": "integer"}}],
                "responses": {
                    "200": {
                        "description": "OK",
                        "content": {
                            "application/json": {
                                "schema": {"type": "array", "items": {"$ref": "#/components/schemas/Job"}}
                            }
                        },
                    }
                },
            }
        },
        "/api/v1/legacy-job/{job_id}": {
            "delete": {
                "tags": ["Jobs"],
                "summary": "Delete legacy job",
                "operationId": "delete_legacy",
                "parameters": [{"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                "security": [{"HTTPBearer": []}],
                "responses": {"204": {"description": "Gone"}},
            }
        },
    },
    "components": {
        "securitySchemes": {"HTTPBearer": {"type": "http", "scheme": "bearer"}},
        "schemas": {
            "Job": {
                "type": "object",
                "required": ["id", "title"],
                "properties": {"id": {"type": "string", "format": "uuid"}, "title": {"type": "string"}},
            }
        },
    },
}


def make_root(tmp_path: Path, spec: dict, overrides: str | None = None) -> Path:
    (tmp_path / "docs/api").mkdir(parents=True)
    (tmp_path / "docs/api/openapi.yaml").write_text(yaml.safe_dump(spec, sort_keys=False))
    shutil.copytree(
        ROOT / "postman/environments",
        tmp_path / "postman/environments",
        ignore=shutil.ignore_patterns("personal.environment.yaml"),
    )
    if overrides:
        (tmp_path / "postman/overrides").mkdir(parents=True)
        (tmp_path / "postman/overrides/requests.yaml").write_text(overrides)
    return tmp_path


def sync(root: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["node", str(POSTMAN_SCRIPT), *args],
        env={**os.environ, "DOCS_SYNC_ROOT": str(root), "NODE_NO_WARNINGS": "1"},
        capture_output=True,
        text=True,
        timeout=120,
    )


def requests_in(root: Path) -> dict[str, dict]:
    collection = root / "postman/collections/Fixture API"
    return {p.relative_to(collection).as_posix(): yaml.safe_load(p.read_text()) for p in collection.rglob("*.request.yaml")}


@needs_node_tools
def test_collection_tracks_added_changed_and_removed_operations(tmp_path: Path) -> None:
    root = make_root(tmp_path, BASE_SPEC)
    assert sync(root).returncode == 0, sync(root).stderr
    first = requests_in(root)
    assert set(first) == {"Jobs/List jobs.request.yaml", "Jobs/Delete legacy job.request.yaml"}
    delete = first["Jobs/Delete legacy job.request.yaml"]
    assert delete["method"] == "DELETE"
    assert delete["url"] == "{{base_url}}/api/v1/legacy-job/:job_id"
    assert delete["auth"]["type"] == "bearer"
    assert "{{access_token}}" in str(delete["auth"])
    assert "auth" not in first["Jobs/List jobs.request.yaml"]
    assert (root / "postman/collections/Fixture API/.resources/definition.yaml").exists()

    # Regenerating unchanged input is byte-identical (ids included).
    snapshot = {p: (root / "postman/collections/Fixture API" / p).read_text() for p in first}
    assert sync(root, "--check").returncode == 0
    assert sync(root).returncode == 0
    assert {p: (root / "postman/collections/Fixture API" / p).read_text() for p in first} == snapshot

    # Teammate: add POST /notifications, remove DELETE /legacy-job, add a query param.
    spec = yaml.safe_load(yaml.safe_dump(BASE_SPEC))
    del spec["paths"]["/api/v1/legacy-job/{job_id}"]
    spec["paths"]["/api/v1/jobs"]["get"]["parameters"].append({"name": "remote", "in": "query", "schema": {"type": "boolean"}})
    spec["paths"]["/api/v1/notifications"] = {
        "post": {
            "tags": ["Notifications"],
            "summary": "Send notification",
            "operationId": "notify",
            "requestBody": {"content": {"application/json": {"schema": {"type": "object", "properties": {"text": {"type": "string"}}}}}},
            "responses": {"201": {"description": "Created"}},
        }
    }
    (root / "docs/api/openapi.yaml").write_text(yaml.safe_dump(spec, sort_keys=False))
    drift = sync(root, "--check")
    assert drift.returncode == 1
    assert "API documentation drift detected" in drift.stdout
    assert sync(root).returncode == 0
    after = requests_in(root)
    assert set(after) == {"Jobs/List jobs.request.yaml", "Notifications/Send notification.request.yaml"}
    query = after["Jobs/List jobs.request.yaml"]["queryParams"]  # v3: list of {key, value} or a map
    assert (list(query) if isinstance(query, dict) else [q["key"] for q in query]) == ["limit", "remote"]
    assert after["Notifications/Send notification.request.yaml"]["body"]["type"] == "json"


@needs_node_tools
def test_overrides_are_merged_and_stale_ones_fail(tmp_path: Path) -> None:
    overrides = """
requests:
  "GET /api/v1/jobs":
    scripts:
      - type: afterResponse
        code: pm.test("ok", () => pm.response.to.have.status(200));
"""
    root = make_root(tmp_path, BASE_SPEC, overrides)
    result = sync(root)
    assert result.returncode == 0, result.stderr
    jobs = requests_in(root)["Jobs/List jobs.request.yaml"]
    tests = next(s["code"] for s in jobs["scripts"] if s["type"] == "afterResponse")
    assert "No server error" in tests  # generated
    assert 'pm.test("ok"' in tests  # hand-written, after the generated ones
    assert 'if (pm.variables.get("mock_run") !== "true")' in tests  # not asserted against the mock

    (root / "postman/overrides/requests.yaml").write_text(overrides.replace("/api/v1/jobs", "/api/v1/gone"))
    stale = sync(root)
    assert stale.returncode == 1
    assert "GET /api/v1/gone" in stale.stderr


@pytest.mark.skipif(not API_PYTHON.exists(), reason="needs apps/api/.venv")
def test_openapi_export_ignores_environment(tmp_path: Path) -> None:
    outputs = []
    for env in ({}, {"DATABASE_URL": "postgresql+asyncpg://elsewhere/db", "APP_VERSION": "9.9.9", "APP_ENV": "production"}):
        target = tmp_path / f"openapi-{len(outputs)}.yaml"
        subprocess.run(
            [str(API_PYTHON), str(TOOLS / "api_docs/export_openapi.py"), str(target)],
            env={"PATH": os.environ["PATH"], **env},
            check=True,
            capture_output=True,
        )
        outputs.append(target.read_text())
    assert outputs[0] == outputs[1]
    schema = yaml.safe_load(outputs[0])
    assert schema["components"]["securitySchemes"]["HTTPBearer"]["scheme"] == "bearer"
    assert "/api/v1/jobs" in schema["paths"]


@needs_node_tools
def test_overlay_folders_and_environment_guards(tmp_path: Path) -> None:
    root = make_root(tmp_path, BASE_SPEC)
    folder = root / "postman/overrides/Sign in"
    folder.mkdir(parents=True)
    (folder / "Verify code.request.yaml").write_text(
        "$kind: http-request\nurl: '{{supabase_url}}/auth/v1/verify'\nmethod: POST\norder: 1000\n"
    )
    result = sync(root)
    assert result.returncode == 0, result.stderr
    copied = yaml.safe_load((root / "postman/collections/Fixture API/Sign in/Verify code.request.yaml").read_text())
    assert copied["id"]  # stable id added to hand-written files too

    # A committed environment must declare every variable and never hold a secret.
    env = root / "postman/environments/local.environment.yaml"
    document = yaml.safe_load(env.read_text())
    document["values"] = [v for v in document["values"] if v["key"] != "supabase_url"]
    for value in document["values"]:
        if value["key"] == "access_token":
            value["value"] = "eyJhbGciOi.leaked.token"
    env.write_text(yaml.safe_dump(document))
    failed = sync(root, "--check")
    assert failed.returncode == 1
    assert 'missing variable "supabase_url"' in failed.stderr
    assert 'secret "access_token" must be committed empty' in failed.stderr


def test_publish_refuses_without_a_workspace(tmp_path: Path) -> None:
    result = subprocess.run(
        ["sh", str(TOOLS / "api_docs/publish.sh")],
        env={"PATH": os.environ["PATH"], "HOME": str(tmp_path)},
        capture_output=True,
        text=True,
        cwd=tmp_path,
    )
    if (ROOT / ".postman/resources.yaml").exists():
        pytest.skip("this checkout is bound to a Postman workspace")
    assert result.returncode == 1
    assert "POSTMAN_WORKSPACE_ID" in result.stderr


@needs_node_tools
def test_requests_are_documented_wired_and_guarded(tmp_path: Path) -> None:
    spec = yaml.safe_load(yaml.safe_dump(BASE_SPEC))
    spec["paths"]["/api/v1/jobs/{job_id}"] = {
        "get": {
            "tags": ["Jobs"],
            "summary": "Get job",
            "operationId": "get_job",
            "parameters": [{"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}}],
            "responses": {"200": {"description": "OK"}},
        }
    }
    root = make_root(tmp_path, spec, 'requests:\n  "DELETE /api/v1/legacy-job/{job_id}":\n    guard: destructive\n')
    result = sync(root)
    assert result.returncode == 0, result.stderr
    requests = requests_in(root)
    listing, get, delete = (requests[f"Jobs/{n}.request.yaml"] for n in ("List jobs", "Get job", "Delete legacy job"))

    # The list request captures the id; the item request uses it and says where it comes from.
    list_tests = next(s["code"] for s in listing["scripts"] if s["type"] == "afterResponse")
    assert 'pm.environment.set("job_id"' in list_tests
    assert "pm.response.to.have.jsonSchema(schema)" in list_tests
    assert get["pathVariables"][0]["value"] == "{{job_id}}"
    assert '"Jobs › List jobs"' in get["description"]
    assert "**Depends on**" in get["description"]
    # Producers run before consumers; deletes last.
    assert listing["order"] < get["order"] < delete["order"]

    guards = next(s["code"] for s in delete["scripts"] if s["type"] == "beforeRequest")
    assert 'pm.environment.get("allow_writes") !== "true"' in guards
    assert 'pm.environment.get("allow_destructive") !== "true"' in guards
    assert "pm.execution.skipRequest()" in guards
    globals_file = yaml.safe_load((root / "postman/globals/workspace.globals.yaml").read_text())
    assert [v["key"] for v in globals_file["values"]] == ["job_id"]
    for document in ("WORKSPACE-README.md", "API reference.md", "Request dependencies.md", "Testing.md"):
        assert (root / "postman/documents" / document).exists()
    assert (root / "postman/specs/fixture-api.yaml").exists()
    assert (root / "postman/mocks/fixture-api/config.yaml").exists()


@needs_node_tools
def test_flows_reference_request_files_by_path(tmp_path: Path) -> None:
    import json

    root = make_root(tmp_path, BASE_SPEC)
    (root / "postman/overrides").mkdir(parents=True, exist_ok=True)
    (root / "postman/overrides/flows.yaml").write_text(
        "flows:\n  - name: Browse\n    steps:\n      - GET /api/v1/jobs\n      - step: DELETE /api/v1/legacy-job/{job_id}\n        variables: {job_id: abc}\n"
    )
    result = sync(root)
    assert result.returncode == 0, result.stderr
    flow = json.loads((root / "postman/flows/Browse.flow").read_text())
    blocks = [n for n in flow["flow"]["nodes"].values() if n["type"] == "task/http-request@1"]
    assert [b["config"]["element"]["path"] for b in blocks] == [
        "postman/collections/Fixture API/Jobs/List jobs.request.yaml",
        "postman/collections/Fixture API/Jobs/Delete legacy job.request.yaml",
    ]
    for block in blocks:
        assert (root / block["config"]["element"]["path"]).exists()
    assert blocks[1]["config"]["requestVariables"][0]["value"] == "abc"
    links = list(flow["flow"]["connections"].values())
    assert {"sourcePort": "success", "targetPort": "AI"}.items() <= links[-1].items()

    (root / "postman/overrides/flows.yaml").write_text("flows:\n  - name: Broken\n    steps: [GET /api/v1/nowhere]\n")
    broken = sync(root)
    assert broken.returncode == 1
    assert 'step "GET /api/v1/nowhere"' in broken.stderr


@needs_node_tools
def test_publish_staging_gives_new_items_owner_prefixed_v4_ids(tmp_path: Path) -> None:
    import re

    staged = tmp_path / "stage"
    shutil.copytree(ROOT / "postman", staged / "postman", ignore=shutil.ignore_patterns("overrides"))
    before = (ROOT / "postman/collections/Remote AI Platform/.resources/definition.yaml").read_text()
    result = subprocess.run(["node", str(TOOLS / "api_docs/stage_publish.mjs"), str(staged), "12345"], capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stderr
    staged_ids = [
        re.search(r"^id: (.*)$", p.read_text(), re.M).group(1)
        for p in (staged / "postman/collections").rglob("*.yaml")
        if re.search(r"^id: ", p.read_text(), re.M)
    ]
    assert staged_ids
    assert all(re.fullmatch(r"12345-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}", i) for i in staged_ids)
    # The repository itself is untouched.
    assert (ROOT / "postman/collections/Remote AI Platform/.resources/definition.yaml").read_text() == before
