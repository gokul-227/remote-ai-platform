"""OpenAPI export and the OpenAPI -> Postman cloud sync, run for real (official
converter) against fixture specs. Postman itself is never contacted here."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "tools"
SYNC_SCRIPT = TOOLS / "api_docs/postman_sync.mjs"
API_PYTHON = ROOT / "apps/api/.venv/bin/python"

needs_node_tools = pytest.mark.skipif(
    not (TOOLS / "node_modules/openapi-to-postmanv2").exists() or not shutil.which("node"),
    reason="run `npm ci --prefix tools --ignore-scripts` first",
)
needs_api = pytest.mark.skipif(not API_PYTHON.exists(), reason="needs apps/api/.venv")

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


def build(spec_path: Path, base_url: str = "") -> dict:
    """The collection postman_sync.mjs would send, via its exported builder."""
    code = (
        f"import {{ buildCollection }} from {json.dumps(SYNC_SCRIPT.as_uri())};"
        "import { readFileSync } from 'node:fs';"
        "const r = await buildCollection(readFileSync(process.argv[1], 'utf8'), process.argv[2]);"
        "console.log(JSON.stringify(r));"
    )
    result = subprocess.run(
        ["node", "--input-type=module", "-e", code, str(spec_path), base_url],
        capture_output=True, text=True, timeout=120, check=True,
    )
    return json.loads(result.stdout)


def write_spec(tmp_path: Path, spec: dict) -> Path:
    path = tmp_path / "openapi.yaml"
    path.write_text(yaml.safe_dump(spec, sort_keys=False))
    return path


@needs_node_tools
def test_collection_is_deterministic_and_hash_tracks_the_spec(tmp_path: Path) -> None:
    spec_path = write_spec(tmp_path, BASE_SPEC)
    first, second = build(spec_path), build(spec_path)
    assert first == second
    collection = first["collection"]
    assert collection["info"]["name"] == "Fixture API"
    assert [f["name"] for f in collection["item"]] == ["Jobs"]
    assert {r["name"] for r in collection["item"][0]["item"]} == {"List jobs", "Delete legacy job"}
    assert '"id"' not in json.dumps(collection)  # Postman assigns ids
    variables = {v["key"]: v["value"] for v in collection["variable"]}
    assert variables["openapi_sha256"] == first["hash"]

    changed = json.loads(json.dumps(BASE_SPEC))
    changed["paths"]["/api/v1/jobs"]["get"]["summary"] = "List all jobs"
    assert build(write_spec(tmp_path, changed))["hash"] != first["hash"]


@needs_node_tools
def test_base_url_override_changes_the_collection(tmp_path: Path) -> None:
    spec_path = write_spec(tmp_path, BASE_SPEC)
    local, prod = build(spec_path), build(spec_path, "https://api.example.com")
    variables = {v["key"]: v["value"] for v in prod["collection"]["variable"]}
    assert variables["baseUrl"] == "https://api.example.com"
    assert local["hash"] != prod["hash"]


@needs_node_tools
@pytest.mark.parametrize("args, env", [(["--dry-run"], {"POSTMAN_API_KEY": "not-a-real-key"}), ([], {})])
def test_dry_run_and_missing_key_never_contact_postman(tmp_path: Path, args: list[str], env: dict) -> None:
    clean = {k: v for k, v in os.environ.items() if not k.startswith("POSTMAN_")}
    result = subprocess.run(
        ["node", str(SYNC_SCRIPT), str(write_spec(tmp_path, BASE_SPEC)), *args],
        env={**clean, **env}, capture_output=True, text=True, timeout=120,
    )
    assert result.returncode == 0, result.stderr
    assert "2 requests" in result.stdout
    assert "Postman was not contacted" in result.stdout
    assert "not-a-real-key" not in result.stdout + result.stderr


@needs_node_tools
def test_invalid_spec_fails_clearly(tmp_path: Path) -> None:
    bad = tmp_path / "openapi.yaml"
    bad.write_text("openapi: 3.1.0\npaths: [not, a, mapping]\n")
    result = subprocess.run(["node", str(SYNC_SCRIPT), str(bad), "--dry-run"], capture_output=True, text=True, timeout=120)
    assert result.returncode == 1
    assert "Failed to convert the OpenAPI specification" in result.stderr


@needs_api
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
