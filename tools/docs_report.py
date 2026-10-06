"""Pull-request comment describing what a PR changes in the generated docs.

    python -m tools.docs_report architecture BASE HEAD
    python -m tools.docs_report api BASE HEAD

Compares the committed artifacts at two commits (the PR's merge base and its
head, after the sync workflows have committed) and prints Markdown, or nothing
when the PR changes nothing of that kind. The first line is a marker the
workflows use to update the same comment on every push.
"""

from __future__ import annotations

import subprocess
import sys
from typing import Any

import yaml

REPO_RAW = "https://raw.githubusercontent.com/{repo}/{sha}/{path}"
METHODS = ("get", "put", "post", "delete", "options", "head", "patch", "trace")
MARKERS = {
    "architecture": "<!-- docs-sync:architecture -->",
    "api": "<!-- docs-sync:api -->",
}


def show(sha: str, path: str) -> str | None:
    """File contents at a commit, or None when it does not exist there."""
    result = subprocess.run(
        ["git", "show", f"{sha}:{path}"], capture_output=True, text=True, check=False
    )
    return result.stdout if result.returncode == 0 else None


def load(sha: str, path: str) -> dict[str, Any]:
    text = show(sha, path)
    return (yaml.safe_load(text) or {}) if text else {}


def changed_paths(base: str, head: str, *paths: str) -> list[tuple[str, str]]:
    """(status letter, path) for files that differ between the two commits."""
    out = subprocess.run(
        ["git", "diff", "--name-status", "--no-renames", base, head, "--", *paths],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return [(line[0], line.split("\t", 1)[1]) for line in out.splitlines() if "\t" in line]


# --- architecture -----------------------------------------------------------

COMPONENT_FIELDS = ("name", "type", "technology", "provider", "group", "status")


def architecture_diff(old: dict[str, Any], new: dict[str, Any]) -> dict[str, list[Any]]:
    before = {c["id"]: c for c in old.get("components", [])}
    after = {c["id"]: c for c in new.get("components", [])}
    changed = []
    for cid in sorted(before.keys() & after.keys()):
        fields = [
            (f, before[cid].get(f), after[cid].get(f))
            for f in COMPONENT_FIELDS
            if before[cid].get(f) != after[cid].get(f)
        ]
        if fields:
            changed.append((after[cid], fields))

    def edges(model: dict[str, Any]) -> set[tuple[str, str, str]]:
        return {(e["from"], e["to"], e.get("label", "")) for e in model.get("connections", [])}

    return {
        "added": [after[c] for c in sorted(after.keys() - before.keys())],
        "removed": [before[c] for c in sorted(before.keys() - after.keys())],
        "changed": changed,
        "edges_added": sorted(edges(new) - edges(old)),
        "edges_removed": sorted(edges(old) - edges(new)),
        "_names": {**{c: v["name"] for c, v in before.items()}, **{c: v["name"] for c, v in after.items()}},
    }


def architecture_report(base: str, head: str, repo: str) -> str:
    path = "docs/architecture/architecture.yaml"
    diff = architecture_diff(load(base, path), load(head, path))
    images = [
        p
        for _, p in changed_paths(base, head, "docs/architecture")
        if p.endswith(".png")
    ]
    if not any(diff[k] for k in ("added", "removed", "changed", "edges_added", "edges_removed")) and not images:
        return ""

    groups = {g["id"]: g["name"] for g in load(head, path).get("groups", [])}
    names = diff["_names"]

    def component(c: dict[str, Any]) -> str:
        where = groups.get(c.get("group", ""), c.get("group", ""))
        tech = f" — {c['technology']}" if c.get("technology") else ""
        return f"**{c['name']}** ({where}){tech}"

    def edge(e: tuple[str, str, str]) -> str:
        label = f" · {e[2]}" if e[2] else ""
        return f"{names.get(e[0], e[0])} → {names.get(e[1], e[1])}{label}"

    lines = [MARKERS["architecture"], "## Architecture changes in this PR", ""]
    for c in diff["added"]:
        lines.append(f"- Added: {component(c)}")
    for c in diff["removed"]:
        lines.append(f"- Removed: {component(c)}")
    for c, fields in diff["changed"]:
        what = "; ".join(f"{f}: {old or '—'} → {new or '—'}" for f, old, new in fields)
        lines.append(f"- Changed: **{c['name']}** ({what})")
    for e in diff["edges_added"]:
        lines.append(f"- New connection: {edge(e)}")
    for e in diff["edges_removed"]:
        lines.append(f"- Removed connection: {edge(e)}")
    if len(lines) == 3:
        lines.append("- Layout, labels or icons only (see the diagrams below).")

    for png in sorted(images):
        title = "Infrastructure" if png.endswith("architecture.png") else "Product"
        before = REPO_RAW.format(repo=repo, sha=base, path=png)
        after = REPO_RAW.format(repo=repo, sha=head, path=png)
        lines += [
            "",
            f"<details{' open' if title == 'Infrastructure' else ''}><summary><b>{title} diagram: before → after</b></summary>",
            "",
            "| Before (base) | After (this PR) |",
            "|---|---|",
            f"| ![before]({before}) | ![after]({after}) |",
            "",
            f"Editable: [`{png.replace('.png', '.drawio')}`](https://github.com/{repo}/blob/{head}/{png.replace('.png', '.drawio')})",
            "</details>",
        ]
    lines += ["", "_Generated from the repository by the Architecture sync workflow; do not edit the diagrams by hand._"]
    return "\n".join(lines) + "\n"


# --- API / Postman ------------------------------------------------------------


def operations(spec: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    ops = {}
    for path, item in (spec.get("paths") or {}).items():
        shared = item.get("parameters", [])
        for method in METHODS:
            if method in item:
                op = dict(item[method])
                op["parameters"] = shared + op.get("parameters", [])
                ops[(method.upper(), path)] = op
    return ops


def _params(op: dict[str, Any]) -> dict[tuple[str, str], Any]:
    return {(p.get("in", ""), p.get("name", "")): p for p in op.get("parameters", [])}


def operation_changes(old: dict[str, Any], new: dict[str, Any]) -> list[str]:
    """Human-readable differences between two versions of one operation."""
    notes = []
    before, after = _params(old), _params(new)
    for key in sorted(after.keys() - before.keys()):
        notes.append(f"{key[0]} parameter `{key[1]}` added{' (required)' if after[key].get('required') else ''}")
    for key in sorted(before.keys() - after.keys()):
        notes.append(f"{key[0]} parameter `{key[1]}` removed")
    for key in sorted(before.keys() & after.keys()):
        if before[key] != after[key]:
            notes.append(f"{key[0]} parameter `{key[1]}` changed")
    if old.get("requestBody") != new.get("requestBody"):
        notes.append(
            "request body added" if not old.get("requestBody")
            else "request body removed" if not new.get("requestBody")
            else "request body changed"
        )
    old_codes, new_codes = set(old.get("responses", {})), set(new.get("responses", {}))
    for code in sorted(new_codes - old_codes):
        notes.append(f"response {code} added")
    for code in sorted(old_codes - new_codes):
        notes.append(f"response {code} removed")
    if any(old["responses"][c] != new["responses"][c] for c in old_codes & new_codes):
        notes.append("response schema changed")
    if old.get("security") != new.get("security"):
        notes.append("authorization changed")
    for field in ("summary", "description", "tags", "deprecated"):
        if old.get(field) != new.get(field):
            notes.append(f"{field} changed")
    return notes


def api_report(base: str, head: str, repo: str) -> str:
    path = "docs/api/openapi.yaml"
    old_spec, new_spec = load(base, path), load(head, path)
    before, after = operations(old_spec), operations(new_spec)
    added = sorted(after.keys() - before.keys(), key=lambda k: (k[1], k[0]))
    removed = sorted(before.keys() - after.keys(), key=lambda k: (k[1], k[0]))
    changed = [
        (key, notes)
        for key in sorted(before.keys() & after.keys(), key=lambda k: (k[1], k[0]))
        if (notes := operation_changes(before[key], after[key]))
    ]
    old_schemas = (old_spec.get("components") or {}).get("schemas") or {}
    new_schemas = (new_spec.get("components") or {}).get("schemas") or {}
    schema_notes = (
        [f"`{s}` added" for s in sorted(new_schemas.keys() - old_schemas.keys())]
        + [f"`{s}` removed" for s in sorted(old_schemas.keys() - new_schemas.keys())]
        + [f"`{s}` changed" for s in sorted(old_schemas.keys() & new_schemas.keys()) if old_schemas[s] != new_schemas[s]]
    )
    requests = [
        (status, p)
        for status, p in changed_paths(base, head, "postman/collections")
        if p.endswith(".request.yaml")
    ]
    if not (added or removed or changed or schema_notes or requests):
        return ""

    def request_name(p: str) -> str:
        parts = p.split("/")[2:]  # drop postman/collections
        return " › ".join(parts[1:-1] + [parts[-1].removesuffix(".request.yaml")])

    def link(p: str, sha: str) -> str:
        return f"[{request_name(p)}](https://github.com/{repo}/blob/{sha}/{p.replace(' ', '%20')})"

    def summary(op: dict[str, Any]) -> str:
        return f" — {op['summary']}" if op.get("summary") else ""

    lines = [MARKERS["api"], "## API & Postman changes in this PR", ""]
    if added or removed or changed:
        lines += ["| | Endpoint | What changed |", "|---|---|---|"]
        lines += [f"| ➕ | `{m} {p}` | new endpoint{summary(after[(m, p)])} |" for m, p in added]
        lines += [f"| ➖ | `{m} {p}` | removed{summary(before[(m, p)])} |" for m, p in removed]
        lines += [f"| ✏️ | `{m} {p}` | {'; '.join(notes)} |" for (m, p), notes in changed]
        lines.append("")
    if schema_notes:
        lines += [f"**Schemas:** {', '.join(schema_notes)}", ""]
    if requests:
        lines.append("**Postman collection (Collection v3):**")
        labels = {"A": "added", "D": "removed", "M": "updated"}
        for status, p in sorted(requests, key=lambda r: ("ADM".find(r[0]), r[1])):
            target = link(p, base if status == "D" else head)
            lines.append(f"- {labels.get(status, 'updated')}: {target}")
        lines.append("")
    lines.append(
        "_Generated from FastAPI → OpenAPI → Postman by the Postman sync workflow. "
        "The Postman workspace is updated from `prod` after merge._"
    )
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    if len(argv) != 4 or argv[0] not in MARKERS:
        print(__doc__, file=sys.stderr)
        return 2
    kind, base, head, repo = argv
    report = architecture_report if kind == "architecture" else api_report
    sys.stdout.write(report(base, head, repo))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
