"""Turn discovered facts + the catalog into the architecture model, and validate it."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .discover import MAIN_FILE, SETTINGS_FILE

# Settings that look like an external service endpoint or credential. Each one
# must be referenced by a catalog rule or listed under `ignore.settings`.
EXTERNAL_SETTING = re.compile(r"(_URL|_ENDPOINT|_API_KEY|_AUTH_KEY|_SECRET_KEY|_SECRET|_TOKEN|_DSN)$")

COMPONENT_FIELDS = ("id", "name", "type", "technology", "provider", "group", "icon", "status")


class UnclassifiedError(Exception):
    """Discovery found evidence the catalog does not account for."""

    def __init__(self, items: list[str]):
        super().__init__("\n".join(items))
        self.items = items


def _rule_matches(rule: dict[str, Any], facts: dict[str, Any], root: Path) -> list[str]:
    """Evidence strings for a matching rule; empty when it does not match."""
    if "python_dep" in rule:
        name = rule["python_dep"]
        return [f"apps/api/pyproject.toml: {name}"] if name in facts["python_deps"] else []
    if "node_dep" in rule:
        name = rule["node_dep"]
        return [f"apps/web/package.json: {name}"] if name in facts["node_deps"] else []
    if "setting" in rule:
        name = rule["setting"]
        return [f"{SETTINGS_FILE}: {name}"] if name in facts["settings"] else []
    if "file" in rule:
        return [p.relative_to(root).as_posix() for p in sorted(root.glob(rule["file"]))]
    if "file_contains" in rule:
        spec = rule["file_contains"]
        pattern = re.compile(spec["regex"])
        return [
            f"{p.relative_to(root).as_posix()} ~ /{spec['regex']}/"
            for p in sorted(root.glob(spec["glob"]))
            if p.is_file() and pattern.search(p.read_text())
        ]
    raise ValueError(f"unknown rule: {rule}")


def _fill(text: str, facts: dict[str, Any]) -> str:
    return re.sub(r"\{([^}]+)\}", lambda m: str(facts["placeholders"].get(m.group(1), "?")), text)


def _component(spec: dict[str, Any], facts: dict[str, Any], evidence: list[str]) -> dict[str, Any]:
    component = {k: spec[k] for k in COMPONENT_FIELDS if k in spec}
    component["technology"] = _fill(component.get("technology", ""), facts)
    status = spec.get("status")
    if status:
        enabled = facts["settings"].get(status["setting"]) == status["enabled_when"]
        component["status"] = "active" if enabled else "disabled"
        evidence = [*evidence, f"{SETTINGS_FILE}: {status['setting']}={facts['settings'].get(status['setting'])}"]
    else:
        component["status"] = "active"
    component["evidence"] = evidence
    return component


def _router_name(module: str) -> str:
    parts = module.split(".")
    if parts[1] == "domains":
        name = parts[2]
        return name if parts[-1] == "router" else f"{name}.{parts[-1].removesuffix('_router')}"
    return parts[-1]


def build_model(catalog: dict[str, Any], facts: dict[str, Any], root: Path) -> dict[str, Any]:
    components: list[dict[str, Any]] = []
    referenced: dict[str, set[str]] = {"python_dep": set(), "node_dep": set(), "setting": set()}

    for spec in catalog["components"]:
        evidence: list[str] = []
        for rule in spec["detect"]:
            for kind in referenced:
                if kind in rule:
                    referenced[kind].add(rule[kind])
            evidence += _rule_matches(rule, facts, root)
        if spec.get("status"):
            referenced["setting"].add(spec["status"]["setting"])
        if evidence:
            components.append(_component(spec, facts, evidence))

    unclassified: list[str] = []
    for prefix in facts["ai_providers"]:
        known = catalog["ai_providers"].get(prefix)
        if not known:
            unclassified.append(f"AI provider '{prefix}' (AI_FREE_TIER_CHAIN) -> catalog.ai_providers")
            continue
        components.append(
            _component(
                {"id": f"ai-{prefix}", "type": "external", "technology": "LLM API", "group": "ai-providers", **known},
                facts,
                [f"{SETTINGS_FILE}: AI_FREE_TIER_CHAIN {prefix}/*"],
            )
        )
    for source in facts["job_boards"]:
        known = catalog["job_boards"].get(source)
        if not known:
            unclassified.append(f"job board '{source}' (aggregators) -> catalog.job_boards")
            continue
        components.append(
            _component(
                {"id": f"board-{source.lower()}", "type": "external", "technology": "Jobs API", "group": "job-boards", **known},
                facts,
                [f"apps/api/app/domains/jobs/aggregators: source_name={source}"],
            )
        )

    ignore = catalog.get("ignore", {})
    for dep in facts["python_deps"]:
        if dep not in referenced["python_dep"] and dep not in ignore.get("python_deps", []):
            unclassified.append(f"python dependency '{dep}' -> a component rule or ignore.python_deps")
    for dep in facts["node_deps"]:
        if dep not in referenced["node_dep"] and dep not in ignore.get("node_deps", []):
            unclassified.append(f"web dependency '{dep}' -> a component rule or ignore.node_deps")
    for name in facts["settings"]:
        if (
            EXTERNAL_SETTING.search(name)
            and name not in referenced["setting"]
            and name not in ignore.get("settings", [])
            and not name.startswith("MINIO_")  # storage's S3 client settings
        ):
            unclassified.append(f"setting '{name}' looks like an external service -> a component rule or ignore.settings")
    if unclassified:
        raise UnclassifiedError(unclassified)

    for component in components:
        if component["id"] == "api":
            routers = facts["api_routers"]
            component["details"] = {
                "entrypoint": f"{MAIN_FILE}: app",
                # Routers (bounded contexts), not endpoints: endpoint changes belong
                # to the OpenAPI/Postman sync and would churn this model on every PR.
                "routers": [_router_name(r["module"]) for r in routers],
            }

    ids = {c["id"] for c in components}
    used_groups = {c["group"] for c in components}
    groups = [
        {k: g[k] for k in ("id", "name", "provider", "icon", "column", "row") if k in g}
        for g in catalog["groups"]
        if g["id"] in used_groups
    ]
    connections = [
        dict(c) for c in catalog["connections"] if c["from"] in ids | used_groups and c["to"] in ids | used_groups
    ]
    return {"system": catalog["system"], "groups": groups, "components": components, "connections": connections}


def validate_model(model: dict[str, Any]) -> list[str]:
    """Structural problems in a model; empty when valid."""
    errors: list[str] = []
    for key in ("system", "groups", "components", "connections"):
        if key not in model:
            errors.append(f"missing top-level key '{key}'")
    if errors:
        return errors
    if not model["system"].get("name"):
        errors.append("system.name is required")

    group_ids = [g.get("id") for g in model["groups"]]
    component_ids = [c.get("id") for c in model["components"]]
    for kind, ids in (("group", group_ids), ("component", component_ids)):
        duplicates = sorted({i for i in ids if ids.count(i) > 1})
        if duplicates:
            errors.append(f"duplicate {kind} ids: {duplicates}")
    if set(group_ids) & set(component_ids):
        errors.append(f"ids used by both a group and a component: {sorted(set(group_ids) & set(component_ids))}")

    for component in model["components"]:
        for field in ("id", "name", "type", "group", "status"):
            if not component.get(field):
                errors.append(f"component {component.get('id', '?')}: '{field}' is required")
        if component.get("group") not in group_ids:
            errors.append(f"component {component.get('id')}: unknown group '{component.get('group')}'")
        if not component.get("evidence"):
            errors.append(f"component {component.get('id')}: no evidence")
    for group in model["groups"]:
        if group["id"] not in {c.get("group") for c in model["components"]}:
            errors.append(f"group {group['id']} has no components")

    targets = set(group_ids) | set(component_ids)
    for connection in model["connections"]:
        for end in ("from", "to"):
            if connection.get(end) not in targets:
                errors.append(f"connection {connection}: unknown '{end}' endpoint")
    return errors
