"""Architecture discovery/model/draw.io, exercised on a small fixture repository
that teammates' typical changes are applied to."""

from __future__ import annotations

import json
import textwrap
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest
import yaml

from tools.architecture.__main__ import _stamp_png, png_source_hash
from tools.architecture.discover import discover
from tools.architecture.drawio import render
from tools.architecture.model import UnclassifiedError, build_model, validate_model

CATALOG = yaml.safe_load((Path(__file__).parents[1] / "architecture/catalog.yaml").read_text())

DEPS = [
    "fastapi==0.142.1", "starlette==1.7.0", "uvicorn[standard]==0.54.0", "sqlalchemy[asyncio]==2.1.1",
    "asyncpg==0.31.0", "boto3==1.43.105", "litellm==1.103.1", "redis[hiredis]==5.3.1",
    "sentry-sdk[fastapi]==2.71.0", "stripe==11.6.0",
]


def write(root: Path, rel: str, text: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(text))


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    write(tmp_path, "apps/api/pyproject.toml", "[project]\ndependencies = " + json.dumps(DEPS) + "\n")
    write(tmp_path, "apps/api/app/core/config.py", '''
        from pydantic_settings import BaseSettings
        class Settings(BaseSettings):
            SUPABASE_URL: str | None = None
            REDIS_URL: str = "redis://localhost:6379/0"
            DATABASE_URL: str = "postgresql+asyncpg://localhost/db"
            RESEND_API_KEY: str | None = None
            GROQ_API_KEY: str | None = None
            AI_FREE_TIER_CHAIN: str = "groq/llama,gemini/flash"
            MARKETPLACE_PAYMENTS_ENABLED: bool = False
    ''')
    write(tmp_path, "apps/api/app/main.py", '''
        from app.domains.jobs.router import router as jobs_router
        def create_app(app):
            app.include_router(jobs_router, prefix="/api/v1")
    ''')
    write(tmp_path, "apps/api/app/domains/jobs/router.py", '''
        @router.get("/jobs")
        async def list_jobs(): ...
        @router.post("/jobs")
        async def create_job(): ...
    ''')
    write(tmp_path, "apps/api/app/domains/jobs/aggregators/remotive.py", '''
        class RemotiveAggregator(BaseAggregator):
            source_name = "REMOTIVE"
    ''')
    write(tmp_path, "apps/web/package.json", json.dumps({"dependencies": {"next": "16.3.8", "@sentry/nextjs": "10.73.0"}}))
    write(tmp_path, "apps/web/wrangler.jsonc", '{ "main": ".open-next/worker.js" }')
    write(tmp_path, "infra/deploy/render.yaml", "services:\n  - type: web\n")
    write(tmp_path, ".github/workflows/ci.yml", "name: CI\n")
    return tmp_path


def model_for(root: Path) -> dict:
    model = build_model(CATALOG, discover(root), root)
    assert validate_model(model) == []
    return model


def ids(model: dict) -> set[str]:
    return {c["id"] for c in model["components"]}


def edges(model: dict) -> set[tuple[str, str]]:
    return {(c["from"], c["to"]) for c in model["connections"]}


def test_detects_components_with_evidence(repo: Path) -> None:
    model = model_for(repo)
    assert {"users", "web", "api", "auth", "postgres", "storage", "redis", "sentry", "resend", "stripe"} <= ids(model)
    assert {"ai-groq", "ai-gemini", "board-remotive"} <= ids(model)
    assert "worker" not in ids(model)
    api = next(c for c in model["components"] if c["id"] == "api")
    assert api["technology"] == "FastAPI 0.142 · Docker"
    assert api["details"]["routers"] == ["jobs"]
    assert all(c["evidence"] for c in model["components"])


def test_disabled_status_comes_from_settings_default(repo: Path) -> None:
    stripe = next(c for c in model_for(repo)["components"] if c["id"] == "stripe")
    assert stripe["status"] == "disabled"
    config = repo / "apps/api/app/core/config.py"
    config.write_text(config.read_text().replace("MARKETPLACE_PAYMENTS_ENABLED: bool = False", "MARKETPLACE_PAYMENTS_ENABLED: bool = True"))
    stripe = next(c for c in model_for(repo)["components"] if c["id"] == "stripe")
    assert stripe["status"] == "active"


def test_removing_redis_removes_component_and_edge(repo: Path) -> None:
    assert ("api", "redis") in edges(model_for(repo))
    pyproject = repo / "apps/api/pyproject.toml"
    pyproject.write_text(pyproject.read_text().replace('"redis[hiredis]==5.3.1", ', ""))
    model = model_for(repo)
    assert "redis" not in ids(model)
    assert ("api", "redis") not in edges(model)
    assert "cache" not in {g["id"] for g in model["groups"]}


def test_adding_a_worker(repo: Path) -> None:
    (repo / "infra/deploy/render.yaml").write_text("services:\n  - type: web\n  - type: worker\n")
    model = model_for(repo)
    assert "worker" in ids(model)
    assert ("api", "worker") in edges(model)


def test_new_router_shows_up(repo: Path) -> None:
    write(repo, "apps/api/app/domains/notifications/router.py", '@router.post("/notifications")\nasync def notify(): ...\n')
    main = repo / "apps/api/app/main.py"
    main.write_text(
        "from app.domains.notifications.router import router as notifications_router\n"
        + main.read_text()
        + "    app.include_router(notifications_router)\n"
    )
    api = next(c for c in model_for(repo)["components"] if c["id"] == "api")
    assert api["details"]["routers"] == ["jobs", "notifications"]


def test_removing_an_ai_provider(repo: Path) -> None:
    config = repo / "apps/api/app/core/config.py"
    config.write_text(config.read_text().replace(",gemini/flash", ""))
    assert "ai-gemini" not in ids(model_for(repo))


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (lambda r: _replace(r, "apps/api/app/core/config.py", "groq/llama", "anthropic/claude"), "AI provider 'anthropic'"),
        (lambda r: write(r, "apps/api/app/domains/jobs/aggregators/wwr.py", 'class W(BaseAggregator):\n    source_name = "WWR"\n'), "job board 'WWR'"),
        (lambda r: _replace(r, "apps/api/pyproject.toml", '"stripe==11.6.0"', '"stripe==11.6.0", "pinecone==5.0.0"'), "python dependency 'pinecone'"),
        (lambda r: _replace(r, "apps/api/app/core/config.py", "RESEND_API_KEY", "TWILIO_AUTH_TOKEN: str = ''\n    RESEND_API_KEY"), "setting 'TWILIO_AUTH_TOKEN'"),
    ],
)
def test_unclassified_evidence_fails_instead_of_guessing(repo: Path, change, message: str) -> None:
    change(repo)
    with pytest.raises(UnclassifiedError) as error:
        build_model(CATALOG, discover(repo), repo)
    assert any(message in item for item in error.value.items)


def _replace(root: Path, rel: str, old: str, new: str) -> None:
    path = root / rel
    assert old in path.read_text()
    path.write_text(path.read_text().replace(old, new))


def test_validate_model_reports_broken_references() -> None:
    model = {
        "system": {"name": "x"},
        "groups": [{"id": "g"}],
        "components": [
            {"id": "a", "name": "A", "type": "app", "group": "g", "status": "active", "evidence": ["f"]},
            {"id": "a", "name": "A2", "type": "app", "group": "missing", "status": "active", "evidence": []},
        ],
        "connections": [{"from": "a", "to": "nowhere"}],
    }
    errors = "\n".join(validate_model(model))
    assert "duplicate component ids" in errors
    assert "unknown group 'missing'" in errors
    assert "no evidence" in errors
    assert "unknown 'to' endpoint" in errors


def test_drawio_is_deterministic_and_complete(repo: Path) -> None:
    model = model_for(repo)
    first, second = render(model), render(model)
    assert first == second
    root = ET.fromstring(first)
    cells = {c.get("id"): c for c in root.iter("mxCell")}
    for component in model["components"]:
        assert cells[component["id"]].get("parent") == f"group-{component['group']}"
    edge_cells = [c for c in cells.values() if c.get("edge") == "1"]
    assert len(edge_cells) == len(model["connections"])
    assert all(cells.get(e.get("source")) is not None and cells.get(e.get("target")) is not None for e in edge_cells)


def test_png_stamp_round_trip() -> None:
    # Minimal valid PNG: signature + IHDR + IEND.
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000049454e44ae426082"
    )
    assert png_source_hash(png) is None
    assert png_source_hash(_stamp_png(png, "abc123")) == "abc123"


# ── Product architecture ────────────────────────────────────────────────────

REPO = Path(__file__).resolve().parents[2]
PRODUCT = yaml.safe_load((Path(__file__).parents[1] / "architecture/product.yaml").read_text())


def _product_model(root: Path = REPO) -> dict:
    from tools.architecture.product import build_product_model

    infrastructure = build_model(CATALOG, discover(REPO), REPO)
    return build_product_model(PRODUCT, root, infrastructure)


def test_product_model_places_every_screen_and_api_domain() -> None:
    from tools.architecture.product import router_prefixes, screens

    model = _product_model()
    placed = {s["route"] for f in model["features"] for s in f["screens"]}
    assert placed == set(screens(REPO))
    domains = {a["domain"] for f in model["features"] for a in f["api"]}
    assert domains == set(router_prefixes(REPO))
    assert [p["id"] for p in model["personas"]] == ["visitor", "professional", "organisation", "admin"]
    stripe = next(p for p in model["platform"] if p["id"] == "stripe")
    assert stripe["status"] == "disabled"
    # The tech stack is evidence-based and complete for this repository.
    stack = {g["group"]: [i["name"] for i in g["items"]] for g in model["stack"]}
    assert "FastAPI" in stack["Backend (apps/api)"]
    assert "Next.js" in stack["Frontend (apps/web)"]
    assert "Postman (OpenAPI converter)" in stack["Quality"]
    # Every infrastructure component is carried into the product diagram.
    assert len(model["infrastructure"]["components"]) == len(build_model(CATALOG, discover(REPO), REPO)["components"])


def test_a_new_screen_must_be_placed(tmp_path: Path) -> None:
    import shutil

    for rel in ("apps/web/src/figma/App.tsx", "apps/web/src/figma/rap_shell.tsx", "apps/api/app/domains/auth/models.py"):
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(REPO / rel, tmp_path / rel)
    shutil.copytree(REPO / "apps/api/app", tmp_path / "apps/api/app", dirs_exist_ok=True)
    app = tmp_path / "apps/web/src/figma/App.tsx"
    app.write_text(app.read_text().replace("  feed: Feed,", "  feed: Feed,\n  invoices: Invoices,"))
    with pytest.raises(UnclassifiedError) as error:
        _product_model(tmp_path)
    assert any("screen 'invoices'" in item for item in error.value.items)


def test_product_drawio_is_deterministic() -> None:
    from tools.architecture.product import render_product

    model = _product_model()
    assert render_product(model) == render_product(model)
    root = ET.fromstring(render_product(model))
    ids = {c.get("id") for c in root.iter("mxCell")}
    assert {f"feature-{f['id']}" for f in model["features"]} <= ids
