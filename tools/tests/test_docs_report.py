"""PR comments for generated docs, on a throwaway git repository where a
teammate's change is committed on top of a base commit."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest
import yaml

from tools.docs_report import MARKERS, api_report, architecture_report, operation_changes

REPO = "owner/repo"
REQUESTS = "postman/collections/Remote AI Platform/Job Posts"


def component(cid: str, name: str, **extra: str) -> dict[str, str]:
    return {"id": cid, "name": name, "type": "external", "group": "g", **extra}


ARCH = {
    "groups": [{"id": "g", "name": "Group"}],
    "components": [component("api", "Backend API"), component("mistral", "Mistral AI")],
    "connections": [{"from": "api", "to": "mistral", "label": "LiteLLM"}],
}

SPEC = {
    "openapi": "3.1.0",
    "paths": {
        "/jobs/company/{id}": {
            "get": {
                "summary": "List Public Company Jobs",
                "parameters": [{"name": "id", "in": "path", "required": True}],
                "responses": {"200": {"description": "OK"}},
            }
        },
        "/legacy": {"delete": {"summary": "Legacy", "responses": {"204": {"description": "Gone"}}}},
    },
    "components": {"schemas": {"Job": {"type": "object"}}},
}


def git(root: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=root, check=True, capture_output=True, text=True).stdout.strip()


def write(root: Path, rel: str, data: object) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(data if isinstance(data, str) else yaml.safe_dump(data))


def commit(root: Path) -> str:
    git(root, "add", "-A")
    git(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "c")
    return git(root, "rev-parse", "HEAD")


@pytest.fixture
def repo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    git(tmp_path, "init", "-q")
    write(tmp_path, "docs/architecture/architecture.yaml", ARCH)
    write(tmp_path, "docs/architecture/architecture.png", "png v1")
    write(tmp_path, "docs/api/openapi.yaml", SPEC)
    write(tmp_path, f"{REQUESTS}/List Public Company Jobs.request.yaml", "v1")
    write(tmp_path, f"{REQUESTS}/Legacy.request.yaml", "v1")
    monkeypatch.chdir(tmp_path)
    return tmp_path


def test_no_changes_means_no_comment(repo: Path) -> None:
    base = commit(repo)
    write(repo, "README.md", "unrelated")
    head = commit(repo)
    assert architecture_report(base, head, REPO) == ""
    assert api_report(base, head, REPO) == ""


def test_architecture_component_and_connection_changes(repo: Path) -> None:
    base = commit(repo)
    arch = yaml.safe_load(yaml.safe_dump(ARCH))
    arch["components"] = [
        component("api", "Backend API", technology="FastAPI 1"),
        component("worker", "Background worker", technology="Task queue"),
    ]
    arch["connections"] = [{"from": "api", "to": "worker", "label": "Enqueue"}]
    write(repo, "docs/architecture/architecture.yaml", arch)
    write(repo, "docs/architecture/architecture.png", "png v2")
    head = commit(repo)

    report = architecture_report(base, head, REPO)
    assert report.startswith(MARKERS["architecture"])
    assert "Added: **Background worker** (Group) — Task queue" in report
    assert "Removed: **Mistral AI**" in report
    assert "Changed: **Backend API** (technology: — → FastAPI 1)" in report
    assert "New connection: Backend API → Background worker · Enqueue" in report
    assert "Removed connection: Backend API → Mistral AI · LiteLLM" in report
    # Before/after images are pinned to the two commits.
    assert f"/{REPO}/{base}/docs/architecture/architecture.png" in report
    assert f"/{REPO}/{head}/docs/architecture/architecture.png" in report


def test_layout_only_change_still_reported(repo: Path) -> None:
    base = commit(repo)
    write(repo, "docs/architecture/architecture.png", "png v2")
    head = commit(repo)
    assert "Layout, labels or icons only" in architecture_report(base, head, REPO)


def test_api_added_removed_and_changed_endpoints(repo: Path) -> None:
    base = commit(repo)
    spec = yaml.safe_load(yaml.safe_dump(SPEC))
    del spec["paths"]["/legacy"]
    company = spec["paths"]["/jobs/company/{id}"]["get"]
    company["parameters"].append({"name": "oldest_first", "in": "query"})
    company["security"] = [{"bearer": []}]
    spec["paths"]["/notifications"] = {
        "post": {"summary": "Create Notification", "requestBody": {}, "responses": {"201": {"description": "Created"}}}
    }
    spec["components"]["schemas"]["Notification"] = {"type": "object"}
    write(repo, "docs/api/openapi.yaml", spec)
    (repo / REQUESTS / "Legacy.request.yaml").unlink()
    write(repo, f"{REQUESTS}/List Public Company Jobs.request.yaml", "v2")
    write(repo, "postman/collections/Remote AI Platform/Notifications/Create Notification.request.yaml", "v1")
    head = commit(repo)

    report = api_report(base, head, REPO)
    assert report.startswith(MARKERS["api"])
    assert "| ➕ | `POST /notifications` | new endpoint — Create Notification |" in report
    assert "| ➖ | `DELETE /legacy` | removed — Legacy |" in report
    assert "query parameter `oldest_first` added; authorization changed" in report
    assert "`Notification` added" in report
    assert "added: [Notifications › Create Notification]" in report
    assert "removed: [Job Posts › Legacy]" in report
    assert "updated: [Job Posts › List Public Company Jobs]" in report
    # A removed request links to the base commit, where it still exists.
    assert f"blob/{base}/postman/collections/Remote%20AI%20Platform/Job%20Posts/Legacy.request.yaml" in report


def test_operation_changes_body_and_responses() -> None:
    old = {"parameters": [], "responses": {"200": {"description": "OK"}}}
    new = {
        "parameters": [{"name": "limit", "in": "query", "required": True}],
        "requestBody": {"content": {}},
        "responses": {"200": {"description": "Changed"}, "404": {"description": "Missing"}},
    }
    assert operation_changes(old, new) == [
        "query parameter `limit` added (required)",
        "request body added",
        "response 404 added",
        "response schema changed",
    ]
