"""Collect architecture facts from the repository without importing or running it.

Every fact comes from a file a reviewer can open: dependency manifests, the
API's Settings class, router registrations, job aggregators, deployment
configuration and workflows. The result is plain, sorted data so the same
repository state always yields the same facts.
"""

from __future__ import annotations

import ast
import re
import tomllib
from pathlib import Path
from typing import Any

API = Path("apps/api")
WEB = Path("apps/web")
SETTINGS_FILE = API / "app/core/config.py"
MAIN_FILE = API / "app/main.py"
AGGREGATORS_DIR = API / "app/domains/jobs/aggregators"

_REQ_NAME = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)")


def _dep_name(requirement: str) -> str:
    match = _REQ_NAME.match(requirement)
    return match.group(1).lower().replace("_", "-") if match else requirement


def _major(version: str) -> str:
    """Major version (major.minor for 0.x), so patch bumps never change the diagram."""
    match = re.search(r"(\d+)(?:\.(\d+))?", version)
    if not match:
        return version
    return f"0.{match.group(2)}" if match.group(1) == "0" and match.group(2) else match.group(1)


def python_deps(root: Path) -> dict[str, str]:
    data = tomllib.loads((root / API / "pyproject.toml").read_text())
    deps: dict[str, str] = {}
    for requirement in data["project"]["dependencies"]:
        version = re.search(r"==\s*([\w.]+)", requirement)
        deps[_dep_name(requirement)] = version.group(1) if version else ""
    return dict(sorted(deps.items()))


def node_deps(root: Path) -> dict[str, str]:
    import json

    data = json.loads((root / WEB / "package.json").read_text())
    return dict(sorted(data.get("dependencies", {}).items()))


def settings_defaults(root: Path) -> dict[str, Any]:
    """Field name -> literal default (None when not a literal) of class Settings."""
    tree = ast.parse((root / SETTINGS_FILE).read_text())
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "Settings")
    fields: dict[str, Any] = {}
    for node in cls.body:
        if not (isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name)):
            continue
        value = node.value
        if isinstance(value, ast.Call):  # Field(default=..., validation_alias=...)
            value = next((k.value for k in value.keywords if k.arg == "default"), None)
        try:
            fields[node.target.id] = ast.literal_eval(value) if value is not None else None
        except ValueError:
            fields[node.target.id] = None
    return dict(sorted(fields.items()))


def api_routers(root: Path) -> list[dict[str, Any]]:
    """Modules whose routers app.main mounts."""
    tree = ast.parse((root / MAIN_FILE).read_text())
    modules = {
        alias.asname or alias.name: node.module
        for node in tree.body
        if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("app.")
        for alias in node.names
    }
    mounted = {
        arg.id
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "include_router"
        for arg in node.args[:1]
        if isinstance(arg, ast.Name)
    }
    return [{"module": module} for module in sorted({modules[name] for name in mounted})]


def job_boards(root: Path) -> list[str]:
    boards: set[str] = set()
    for path in sorted((root / AGGREGATORS_DIR).glob("*.py")):
        tree = ast.parse(path.read_text())
        for cls in (n for n in tree.body if isinstance(n, ast.ClassDef)):
            if cls.name == "BaseAggregator":
                continue
            for node in cls.body:
                if (
                    isinstance(node, ast.Assign)
                    and any(isinstance(t, ast.Name) and t.id == "source_name" for t in node.targets)
                    and isinstance(node.value, ast.Constant)
                ):
                    boards.add(str(node.value.value))
    return sorted(boards)


def ai_providers(settings: dict[str, Any]) -> list[str]:
    """Providers in the default LiteLLM chain, in fallback order."""
    chain = settings.get("AI_FREE_TIER_CHAIN") or ""
    providers: list[str] = []
    for model in (m.strip() for m in chain.split(",")):
        provider = model.split("/", 1)[0]
        if model and provider not in providers:
            providers.append(provider)
    return providers


def supabase_db_major(root: Path) -> str:
    config = root / "supabase/config.toml"
    if not config.exists():
        return ""
    return str(tomllib.loads(config.read_text()).get("db", {}).get("major_version", ""))


def discover(root: Path) -> dict[str, Any]:
    settings = settings_defaults(root)
    py = python_deps(root)
    node = node_deps(root)
    return {
        "python_deps": py,
        "node_deps": node,
        "settings": settings,
        "api_routers": api_routers(root),
        "job_boards": job_boards(root),
        "ai_providers": ai_providers(settings),
        "placeholders": {
            **{f"python_dep_major:{k}": _major(v) for k, v in py.items() if v},
            **{f"node_dep_major:{k}": _major(v) for k, v in node.items()},
            "supabase_db_major": supabase_db_major(root),
        },
    }
