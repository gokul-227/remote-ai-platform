"""Product architecture: personas -> features (screens + API) -> platform services.

Built from the same kind of evidence as the infrastructure model -- the web
app's route registry and navigation, the API's mounted routers, UserRole --
grouped by tools/architecture/product.yaml, and drawn in the same style.
"""

from __future__ import annotations

import ast
import html
import json
import re
import tomllib
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from .discover import api_routers
from .drawio import _icon, _style
from .model import UnclassifiedError, _router_name

APP = Path("apps/web/src/figma/App.tsx")
SHELL = Path("apps/web/src/figma/rap_shell.tsx")
ROLES = Path("apps/api/app/domains/auth/models.py")

ACCENTS = ["#2D7FF9", "#8E75B2", "#0EA5E9", "#F38020", "#16A34A", "#DB2777", "#0891B2", "#CA8A04", "#7C3AED", "#059669", "#DC2626", "#475569", "#64748B"]
STEP_MARKS = "①②③④⑤⑥⑦⑧⑨⑩"


# ── Discovery ────────────────────────────────────────────────────────────────


def screens(root: Path) -> list[str]:
    """Route keys of the web app's screen registry (const REG = {...})."""
    text = (root / APP).read_text()
    block = text[text.index("const REG") :]
    block = block[: block.index("\n};")]
    return sorted(set(re.findall(r"^\s+([a-z]+):", block, flags=re.M)))


def nav_labels(root: Path) -> dict[str, str]:
    return dict(re.findall(r'\["([a-z]+)", "([^"]+)", "[a-z]+"\]', (root / SHELL).read_text()))


def roles(root: Path) -> list[str]:
    tree = ast.parse((root / ROLES).read_text())
    enum = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "UserRole")
    return [t.id for n in enum.body if isinstance(n, ast.Assign) for t in n.targets if isinstance(t, ast.Name)]


def router_prefixes(root: Path) -> dict[str, str]:
    """API domain name -> the path prefix its router declares."""
    prefixes = {}
    for router in api_routers(root):
        source = (root / "apps/api" / (router["module"].replace(".", "/") + ".py")).read_text()
        match = re.search(r'APIRouter\(\s*prefix="([^"]*)"', source)
        if match and match.group(1):
            prefixes[_router_name(router["module"])] = match.group(1)
        else:  # no router prefix: the distinct first segments of its routes
            heads = sorted(set(re.findall(r'@router\.\w+\(\s*"(/[^/"{]+)', source)))
            names = [h.lstrip("/") for h in heads]
            prefixes[_router_name(router["module"])] = "/{" + ",".join(names) + "}" if len(names) > 1 else "".join(heads)
    return prefixes


def npm_packages(root: Path) -> set[str]:
    """Every dependency and devDependency in the repository's package.json files."""
    names: set[str] = set()
    for manifest in sorted(root.glob("**/package.json")):
        if "node_modules" in manifest.parts:
            continue
        data = json.loads(manifest.read_text())
        names |= set(data.get("dependencies", {})) | set(data.get("devDependencies", {}))
    return names


def python_packages(root: Path) -> set[str]:
    """Runtime and optional (dev) dependencies of apps/api."""
    project = tomllib.loads((root / "apps/api/pyproject.toml").read_text())["project"]
    requirements = list(project["dependencies"]) + [r for group in project.get("optional-dependencies", {}).values() for r in group]
    return {re.match(r"[A-Za-z0-9._-]+", r).group(0).lower().replace("_", "-") for r in requirements}


def detect_stack(catalog: dict[str, Any], root: Path) -> list[dict[str, Any]]:
    npm, py = npm_packages(root), python_packages(root)
    groups = []
    for group in catalog.get("stack", []):
        items = []
        for item in group["items"]:
            if "npm" in item:
                found, evidence = item["npm"] in npm, f"package.json: {item['npm']}"
            elif "py" in item:
                found, evidence = item["py"] in py, f"apps/api/pyproject.toml: {item['py']}"
            elif "file" in item:
                found, evidence = any(root.glob(item["file"])), item["file"]
            else:
                spec = item["file_contains"]
                found = any(re.search(spec["regex"], p.read_text()) for p in root.glob(spec["glob"]) if p.is_file())
                evidence = f"{spec['glob']} ~ /{spec['regex']}/"
            if found:
                items.append({"name": item["name"], "icon": item["icon"], "evidence": evidence})
        groups.append({"group": group["group"], "items": items})
    return groups


# ── Model ────────────────────────────────────────────────────────────────────


def build_product_model(catalog: dict[str, Any], root: Path, infrastructure: dict[str, Any]) -> dict[str, Any]:
    found_screens, labels, found_roles, prefixes = screens(root), nav_labels(root), roles(root), router_prefixes(root)
    labels = {**labels, **catalog.get("screen_labels", {})}
    infra = {c["id"]: c for c in infrastructure["components"]}
    groups = {g["id"]: g for g in infrastructure["groups"]}

    problems: list[str] = []
    placed_screens: dict[str, str] = {}
    placed_api: dict[str, str] = {}
    features = []
    for spec in catalog["features"]:
        for screen in spec["screens"]:
            if screen not in found_screens:
                problems.append(f"feature {spec['id']}: screen '{screen}' is not in {APP}")
            elif screen in placed_screens:
                problems.append(f"screen '{screen}' is in both {placed_screens[screen]} and {spec['id']}")
            placed_screens[screen] = spec["id"]
        for domain in spec["api"]:
            if domain not in prefixes:
                problems.append(f"feature {spec['id']}: API domain '{domain}' is not mounted in apps/api/app/main.py")
            placed_api[domain] = spec["id"]
        uses = []
        for used in spec["uses"]:
            if used in infra:
                uses.append({"id": used, "name": infra[used]["name"], "status": infra[used]["status"]})
            elif used in groups:
                uses.append({"id": used, "name": groups[used]["name"].split(" (")[0], "status": "active"})
            else:
                problems.append(f"feature {spec['id']}: uses '{used}', which the infrastructure model does not have")
        features.append(
            {
                "id": spec["id"],
                "name": spec["name"],
                "icon": spec.get("icon"),
                **({"step": spec["step"]} if "step" in spec else {}),
                "personas": spec["personas"],
                "screens": [{"route": s, "label": labels.get(s, s)} for s in spec["screens"]],
                "api": [{"domain": d, "prefix": f"/api/v1{prefixes.get(d, '')}" if d != "health" else "/health"} for d in spec["api"]],
                "uses": uses,
            }
        )
    problems += [f"screen '{s}' ({APP}) is in no feature -> {Path(__file__).parent.name}/product.yaml" for s in found_screens if s not in placed_screens]
    problems += [f"API domain '{d}' is in no feature -> {Path(__file__).parent.name}/product.yaml" for d in prefixes if d not in placed_api]
    for persona in catalog["personas"]:
        if persona.get("role") and persona["role"] not in found_roles:
            problems.append(f"persona {persona['id']}: role {persona['role']} is not in UserRole")
    if problems:
        raise UnclassifiedError(problems)

    always = [c for c in ("auth", "postgres") if c in infra]
    platform_ids = always + [u["id"] for f in features for u in f["uses"] if u["id"] not in always]
    platform = []
    for pid in dict.fromkeys(platform_ids):
        if pid in infra:
            platform.append({"id": pid, "name": infra[pid]["name"], "technology": infra[pid].get("technology", ""), "icon": infra[pid].get("icon"), "status": infra[pid]["status"]})
        else:
            members = [c["name"] for c in infrastructure["components"] if c["group"] == pid]
            platform.append({"id": pid, "name": groups[pid]["name"].split(" (")[0], "technology": " · ".join(members), "icon": None, "status": "active"})
    web = next((c for c in infrastructure["components"] if c["id"] == "web"), {})
    api = next((c for c in infrastructure["components"] if c["id"] == "api"), {})
    return {
        "title": catalog["title"],
        "subtitle": catalog["subtitle"],
        "personas": catalog["personas"],
        "features": features,
        "web": {"technology": web.get("technology", ""), "provider": web.get("provider", ""), "screens": len(found_screens)},
        "api": {"technology": api.get("technology", ""), "provider": api.get("provider", ""), "domains": [{"domain": d, "prefix": p} for d, p in prefixes.items()]},
        "platform": platform,
        "infrastructure": {
            "groups": [{k: g[k] for k in ("id", "name", "icon") if k in g} for g in infrastructure["groups"]],
            "components": [{k: c[k] for k in ("id", "name", "technology", "icon", "group", "status") if k in c} for c in infrastructure["components"]],
        },
        "stack": detect_stack(catalog, root),
        "evidence": [str(APP), str(SHELL), str(ROLES), "apps/api/app/main.py", "docs/architecture/architecture.yaml"],
    }


# ── Rendering ────────────────────────────────────────────────────────────────
#
# Enterprise layout, left to right along the request path and top to bottom by
# layer: users & channels -> Cloudflare edge -> the platform (web app over the
# API) -> Supabase & Redis -> external providers; engineering, delivery and
# operations underneath. Every node carries its product's mark or the web
# app's own Lucide glyph. Geometry is fixed so output is deterministic.

Box = tuple[int, int, int, int]
INK, MUTED, LINE = "#1F2937", "#5F6B7A", "#CBD5E1"
REQUEST, DELIVERY = "#334155", "#2088FF"
TOP = 140
COL_A, COL_B, COL_C, COL_D, COL_E = (40, 250), (330, 270), (640, 1230), (1910, 300), (2250, 330)
CANVAS_W = COL_E[0] + COL_E[1] + 40
TILE_H = 64


class _Canvas:
    def __init__(self) -> None:
        self.mxfile = ET.Element("mxfile", host="remote-ai-platform", agent="tools/architecture", type="device")
        diagram = ET.SubElement(self.mxfile, "diagram", id="product", name="Product architecture")
        self.graph = ET.SubElement(diagram, "mxGraphModel", grid="1", gridSize="10", guides="1", tooltips="1", connect="1", arrows="1", fold="1", page="1", pageScale="1", math="0", shadow="0", background="#FFFFFF")
        self.root = ET.SubElement(self.graph, "root")
        ET.SubElement(self.root, "mxCell", id="0")
        ET.SubElement(self.root, "mxCell", attrib={"id": "1", "parent": "0"})
        self.boxes: dict[str, Box] = {}
        self.origin: dict[str, tuple[int, int]] = {"1": (0, 0)}

    def cell(self, cid: str, value: str, style: str, box: Box, parent: str = "1") -> None:
        ox, oy = self.origin[parent]
        c = ET.SubElement(self.root, "mxCell", attrib={"id": cid, "value": value, "style": style, "vertex": "1", "parent": parent})
        x, y, w, h = box
        ET.SubElement(c, "mxGeometry", x=str(x - ox), y=str(y - oy), width=str(w), height=str(h), attrib={"as": "geometry"})
        self.boxes[cid] = box
        self.origin[cid] = (x, y)

    def container(self, cid: str, title: str, box: Box, color: str, fill: str = "#FFFFFF", icon: str | None = None, parent: str = "1", dashed: bool = False, size: int = 14) -> None:
        image = _icon(icon)
        style = _style(
            shape="label" if image else "rect", rounded=1, arcSize=6, absoluteArcSize=1, container=1, collapsible=0, html=1, whiteSpace="wrap",
            fillColor=fill, strokeColor=color, strokeWidth=1.5, dashed=1 if dashed else 0, align="left", verticalAlign="top",
            spacingLeft=42 if image else 14, spacingTop=7, fontColor=INK, fontSize=size,
            **({"image": image, "imageWidth": 24, "imageHeight": 24, "imageAlign": "left", "imageVerticalAlign": "top"} if image else {}),
        )
        self.cell(cid, title, style, box, parent)

    def tile(self, cid: str, title: str, subtitle: str, icon: str | None, box: Box, parent: str, disabled: bool = False, accent: str = LINE, size: int = 12) -> None:
        image = _icon(icon)
        value = f"<b>{html.escape(title)}</b>" + (" <i>(disabled)</i>" if disabled else "")
        if subtitle:
            value += f'<br><font style="font-size:10px" color="{MUTED}">{subtitle}</font>'
        style = _style(
            shape="label", rounded=1, arcSize=8, absoluteArcSize=1, html=1, whiteSpace="wrap",
            fillColor="#F8FAFC" if disabled else "#FFFFFF", strokeColor="#94A3B8" if disabled else accent, dashed=1 if disabled else 0,
            opacity=60 if disabled else 100, align="left", verticalAlign="middle", spacingLeft=(16 + int(box[3] * 0.45)) if image else 12, spacingRight=6,
            fontColor=INK, fontSize=size,
            **({"image": image, "imageWidth": int(box[3] * 0.45), "imageHeight": int(box[3] * 0.45), "imageAlign": "left", "imageVerticalAlign": "middle"} if image else {}),
        )
        self.cell(cid, value, style, box, parent)

    def edge(self, eid: str, source: str, target: str, label: str, points: list[tuple[int, int]], start: tuple[int, int], end: tuple[int, int], delivery: bool = False, label_segment: int | None = None) -> None:
        sx, sy, sw, sh = self.boxes[source]
        tx, ty, tw, th = self.boxes[target]
        style = _style(
            edgeStyle="none", rounded=1, html=1, endArrow="block", endFill=1, endSize=7,
            exitX=round((start[0] - sx) / sw, 4), exitY=round((start[1] - sy) / sh, 4), exitPerimeter=0,
            entryX=round((end[0] - tx) / tw, 4), entryY=round((end[1] - ty) / th, 4), entryPerimeter=0,
            strokeColor=DELIVERY if delivery else REQUEST, strokeWidth=1.6, dashed=1 if delivery else 0,
            fontSize=11, fontColor=INK, labelBackgroundColor="#FFFFFF",
        )
        path = [start, *points, end]
        lengths = [abs(b[0] - a[0]) + abs(b[1] - a[1]) for a, b in zip(path, path[1:], strict=False)]
        longest = label_segment if label_segment is not None else max(range(len(lengths)), key=lambda i: (lengths[i], -i))
        middle = sum(lengths[:longest]) + lengths[longest] / 2
        c = ET.SubElement(self.root, "mxCell", attrib={"id": eid, "value": html.escape(label), "style": style, "edge": "1", "parent": "1", "source": source, "target": target})
        g = ET.SubElement(c, "mxGeometry", x=str(round(2 * middle / (sum(lengths) or 1) - 1, 4)), relative="1", attrib={"as": "geometry"})
        if points:
            array = ET.SubElement(g, "Array", attrib={"as": "points"})
            for px, py in points:
                ET.SubElement(array, "mxPoint", x=str(px), y=str(py))

    def xml(self, width: int, height: int) -> str:
        self.graph.set("pageWidth", str(width))
        self.graph.set("pageHeight", str(height))
        ET.indent(self.mxfile, space="  ")
        return ET.tostring(self.mxfile, encoding="unicode") + "\n"


def _stack(model: dict[str, Any], group: str) -> list[dict[str, Any]]:
    return next((g["items"] for g in model["stack"] if g["group"].startswith(group)), [])


def render_product(model: dict[str, Any]) -> str:
    cv = _Canvas()
    infra = {c["id"]: c for c in model["infrastructure"]["components"]}
    members = lambda group: [c for c in model["infrastructure"]["components"] if c["group"] == group]  # noqa: E731
    text = _style(text=1, html=1, strokeColor="none", fillColor="none", align="left", verticalAlign="top", whiteSpace="wrap", fontColor=INK)

    cv.cell("title", f'<b style="font-size:24px">{html.escape(model["title"])}</b><br><font style="font-size:13px" color="{MUTED}">{html.escape(model["subtitle"])}</font>', text, (40, 26, 1500, 64))
    cv.cell("legend", f'<font color="{REQUEST}">━━ request / data</font>&nbsp;&nbsp;&nbsp;<font color="{DELIVERY}">╍╍ delivery &amp; operations</font>&nbsp;&nbsp;&nbsp;<font color="{MUTED}">dashed tile = in the code, switched off · ① – ⑨ the hiring journey</font>',
            _style(text=1, html=1, strokeColor="none", fillColor="none", align="right", verticalAlign="top", fontSize=12), (CANVAS_W - 900, 40, 860, 24))

    # ── C: the platform (web app over API) — sized first, other columns match it.
    cx, cw = COL_C
    features = model["features"]
    per_row, tile_h, gap = 5, 104, 12
    tile_w = (cw - 40 - 32 - (per_row - 1) * gap) // per_row
    rows = -(-len(features) // per_row)
    web_h = 44 + rows * (tile_h + gap) - gap + 18 + 22 + 40 + 14
    api = model["api"]
    chip_w, chip_h, chips_per_row = 160, 30, 7
    chips, slot, row = [], 0, 0
    for domain in api["domains"]:
        label = domain["prefix"].replace(",", ", ") or "/" + domain["domain"]
        span = 2 if len(label) > 20 else 1
        if slot + span > chips_per_row:
            slot, row = 0, row + 1
        chips.append((domain, label, slot, row, span))
        slot += span
    concerns = [
        ("Supabase JWT (JWKS)", "verifies every token", "concepts/key-round"),
        ("Rate limiting", "Redis, in-memory fallback", "concepts/gauge"),
        ("AI metering", "reserve → settle quotas", "concepts/bot"),
        ("Email outbox", "durable dispatcher", "concepts/mail"),
        ("Prometheus /metrics", "request metrics", "prometheus"),
        ("Sentry SDK", "errors, PII scrubbed", "sentry"),
        ("Alembic", "migrate on start", "concepts/database"),
    ]
    # Anything else running beside the API on its host (e.g. a background worker).
    for c in members("render"):
        if c["id"] != "api":
            concerns.append((c["name"], c.get("technology", ""), c.get("icon") or "concepts/server"))
    api_h = 44 + (row + 1) * (chip_h + 10) + 16 + 22 + 56 + 16 + 22 + 40 + 14
    platform_h = 52 + web_h + 64 + api_h + 20
    web_y, api_y = TOP + 52, TOP + 52 + web_h + 64

    cv.container("platform", "<b>Remote AI Platform</b> — production", (cx, TOP, cw, platform_h), "#0F172A", "#FBFCFE", size=16)
    web = model["web"]
    cv.container("web", f"<b>Experience layer · Web app</b> — {html.escape(web['technology'])} on {html.escape(web['provider'])} · {web['screens']} screens",
                 (cx + 20, web_y, cw - 40, web_h), "#F38020", "#FFF7ED", icon="nextdotjs", parent="platform")
    names = {p["id"]: p["name"] for p in model["personas"]}
    for i, feature in enumerate(features):
        x = cx + 36 + (i % per_row) * (tile_w + gap)  # inside web (cx + 20 .. cx + cw - 20)
        y = web_y + 44 + (i // per_row) * (tile_h + gap)
        step = f"{STEP_MARKS[feature['step'] - 1]} " if feature.get("step") else ""
        screens_text = html.escape(" · ".join(s["label"] for s in feature["screens"][:4]) + (" …" if len(feature["screens"]) > 4 else ""))
        uses = " · ".join(html.escape(u["name"]) for u in feature["uses"]) or "—"
        accent = ACCENTS[i % len(ACCENTS)]
        value = (f'<b>{step}{html.escape(feature["name"])}</b><br><font style="font-size:9px" color="{accent}">{" · ".join(names[p] for p in feature["personas"])}</font>'
                 f'<br><font style="font-size:9px" color="{MUTED}">{screens_text}<br><b>API</b> {html.escape(" ".join((a["prefix"].replace("/api/v1", "") or a["prefix"]).replace(",", ", ") for a in feature["api"]) or "—")} · <b>uses</b> {uses}</font>')
        image = _icon(feature.get("icon"))
        cv.cell(f"feature-{feature['id']}", value,
                _style(shape="label", rounded=1, arcSize=10, absoluteArcSize=1, html=1, whiteSpace="wrap", fillColor="#FFFFFF", strokeColor=accent, strokeWidth=1.4,
                       align="left", verticalAlign="top", spacingLeft=44, spacingTop=6, spacingRight=6, fontSize=11, fontColor=INK,
                       **({"image": image, "imageWidth": 26, "imageHeight": 26, "imageAlign": "left", "imageVerticalAlign": "top"} if image else {})),
                (x, y, tile_w, tile_h), "web")
    stack_y = web_y + 44 + rows * (tile_h + gap) - gap + 18
    cv.cell("web-stack-title", f'<font color="{MUTED}"><b>Frontend stack</b></font>', text + "fontSize=11;", (cx + 36, stack_y, 300, 20), "web")
    for i, item in enumerate(_stack(model, "Frontend")):
        cv.tile(f"web-stack-{i}", item["name"], "", item["icon"], (cx + 36 + i * 142, stack_y + 22, 134, 36), "web", size=11)

    cv.container("api", f"<b>Service layer · Backend API</b> — {html.escape(api['technology'])} on {html.escape(api['provider'])} · {len(api['domains'])} domains under /api/v1",
                 (cx + 20, api_y, cw - 40, api_h), "#1F1F1F", "#F8FAFC", icon="fastapi", parent="platform")
    chip_gap = (cw - 72 - chips_per_row * chip_w) // (chips_per_row - 1)
    for domain, label, slot, chip_row, span in chips:
        x = cx + 36 + slot * (chip_w + chip_gap)
        y = api_y + 44 + chip_row * (chip_h + 10)
        cv.cell(f"api-{domain['domain']}", f'<font face="Menlo,monospace" style="font-size:10px">{html.escape(label)}</font>',
                _style(rounded=1, arcSize=50, html=1, whiteSpace="wrap", fillColor="#FFFFFF", strokeColor="#94A3B8", align="center", verticalAlign="middle", fontColor=INK),
                (x, y, chip_w * span + chip_gap * (span - 1), chip_h), "api")
    cc_y = api_y + 44 + (row + 1) * (chip_h + 10) + 16
    cv.cell("api-cc-title", f'<font color="{MUTED}"><b>Cross-cutting</b></font>', text + "fontSize=11;", (cx + 36, cc_y, 300, 20), "api")
    cc_w = (cw - 72 - (len(concerns) - 1) * 10) // len(concerns)
    for i, (title, sub, icon) in enumerate(concerns):
        cv.tile(f"api-cc-{i}", title, html.escape(sub), icon, (cx + 36 + i * (cc_w + 10), cc_y + 22, cc_w, 56), "api", size=11)
    bs_y = cc_y + 22 + 56 + 16
    cv.cell("api-stack-title", f'<font color="{MUTED}"><b>Backend stack</b></font>', text + "fontSize=11;", (cx + 36, bs_y, 300, 20), "api")
    for i, item in enumerate(_stack(model, "Backend")):
        cv.tile(f"api-stack-{i}", item["name"], "", item["icon"], (cx + 36 + i * 142, bs_y + 22, 134, 36), "api", size=11)

    # ── A: users and channels
    ax, aw = COL_A
    cv.container("users", "<b>Users &amp; channels</b>", (ax, TOP, aw, platform_h), "#64748B", "none", dashed=True)
    for i, persona in enumerate(model["personas"]):
        role = f" · {persona['role']}" if persona.get("role") else ""
        cv.tile(f"persona-{persona['id']}", persona["name"] + role, html.escape(persona["detail"]), persona.get("icon"), (ax + 14, TOP + 48 + i * 92, aw - 28, 80), "users")
    cv.tile("browser", "Web browser", "desktop &amp; mobile · hash-routed SPA", "concepts/monitor-smartphone", (ax + 14, api_y + 20, aw - 28, 80), "users")

    # ── B: Cloudflare edge
    bx, bw = COL_B
    cv.container("edge", "<b>Edge · Cloudflare</b>", (bx, TOP, bw, platform_h), "#F38020", "#FFFFFF", icon="cloudflare")
    edge_tiles = [
        ("edge-dns", "remoteaiplatform.com", "DNS · TLS · CDN", "cloudflare"),
        ("edge-workers", "Cloudflare Workers", "OpenNext runtime · prod + dev", "cloudflareworkers"),
        ("edge-next", "Next.js app", "SSR job pages · sitemap · SPA", "nextdotjs"),
        ("edge-logs", "Workers Logs", "observability", "concepts/activity"),
    ]
    for i, (cid, title, sub, icon) in enumerate(edge_tiles):
        cv.tile(cid, title, sub, icon, (bx + 14, TOP + 48 + i * 90, bw - 28, 76), "edge")

    # ── D: data & identity
    dx, dw = COL_D
    supabase = members("supabase")
    sup_h = 48 + len(supabase) * (TILE_H + 12) + 8
    cv.container("supabase", "<b>Supabase (EU)</b> — data &amp; identity", (dx, TOP, dw, sup_h), "#3ECF8E", "#F0FDF4", icon="supabase")
    for i, c in enumerate(supabase):
        cv.tile(f"d-{c['id']}", c["name"], html.escape(c.get("technology", "")), c.get("icon"), (dx + 14, TOP + 48 + i * (TILE_H + 12), dw - 28, TILE_H), "supabase")
    redis_y = TOP + sup_h + 24
    if "redis" in infra:
        cv.container("cache", "<b>Managed Redis</b>", (dx, redis_y, dw, 48 + TILE_H + 12), "#FF4438", "#FFF5F5", icon="redis")
        cv.tile("d-redis", "Redis", html.escape(infra["redis"]["technology"]), "redis", (dx + 14, redis_y + 48, dw - 28, TILE_H), "cache")

    # ── E: external providers
    ex, ew = COL_E
    y = TOP
    external = []
    for gid, title, icon in (("ai-providers", "AI providers · LiteLLM chain", "concepts/sparkles"), ("job-boards", "Job boards · public APIs", "concepts/briefcase"), ("saas", "Third-party services", "concepts/cloud")):
        items = members(gid)
        if not items:
            continue
        compact = 40 if gid != "saas" else 56
        h = 46 + len(items) * (compact + 8) + 6
        cv.container(f"ext-{gid}", f"<b>{title}</b>", (ex, y, ew, h), "#8E75B2" if gid == "ai-providers" else "#2D7FF9" if gid == "job-boards" else "#64748B", "#FFFFFF", icon=icon)
        for i, c in enumerate(items):
            sub = "" if gid != "saas" else html.escape(c.get("technology", ""))
            cv.tile(f"e-{c['id']}", c["name"], sub, c.get("icon") or icon, (ex + 14, y + 46 + i * (compact + 8), ew - 28, compact), f"ext-{gid}", disabled=c["status"] == "disabled", size=11)
        external.append((f"ext-{gid}", y, h))
        y += h + 20
    main_bottom = max(TOP + platform_h, y)

    # ── Bottom band: engineering, delivery & operations
    band_y = main_bottom + 110
    groups = [g for g in model["stack"] if not g["group"].startswith(("Frontend", "Backend"))]
    col_w = (CANVAS_W - 80 - 28 - (len(groups) - 1) * 20) // len(groups)
    tallest = max(len(g["items"]) for g in groups)
    per_col = 2
    band_h = 48 + 26 + -(-tallest // per_col) * 52 + 16
    cv.container("band", "<b>Engineering, delivery &amp; operations</b> — GitHub is the source of truth; everything here runs from the repository",
                 (40, band_y, CANVAS_W - 80, band_h), "#2088FF", "#F5F9FF", icon="githubactions")
    for gi, group in enumerate(groups):
        gx = 54 + gi * (col_w + 20)
        cv.cell(f"band-g{gi}", f'<font color="{MUTED}"><b>{html.escape(group["group"])}</b></font>', text + "fontSize=12;", (gx, band_y + 46, col_w, 20), "band")
        item_w = (col_w - 10) // per_col
        for i, item in enumerate(group["items"]):
            cv.tile(f"band-{gi}-{i}", item["name"], "", item["icon"], (gx + (i % per_col) * (item_w + 10), band_y + 72 + (i // per_col) * 52, item_w, 44), "band", size=11)

    # ── Flows
    browser = cv.boxes["browser"]
    edge_box = cv.boxes["edge"]
    web_box, api_box = cv.boxes["web"], cv.boxes["api"]
    cv.edge("f-browser-edge", "browser", "edge", "HTTPS", [], (browser[0] + browser[2], browser[1] + 40), (edge_box[0], browser[1] + 40))
    next_box = cv.boxes["edge-next"]
    cv.edge("f-edge-web", "edge-next", "web", "renders", [], (next_box[0] + next_box[2], next_box[1] + 38), (web_box[0], next_box[1] + 38))
    rest_y = api_y + 60
    cv.edge("f-edge-api", "edge", "api", "REST /api/v1 · Bearer JWT", [], (edge_box[0] + edge_box[2], rest_y), (api_box[0], rest_y))
    users_box = cv.boxes["users"]
    if "d-auth" in cv.boxes:
        auth = cv.boxes["d-auth"]
        lane = TOP - 22
        cv.edge("f-signin", "users", "d-auth", "Sign-in · email code / OAuth (supabase-js)", [(users_box[0] + 120, lane), (auth[0] + auth[2] // 2, lane)],
                (users_box[0] + 120, users_box[1]), (auth[0] + auth[2] // 2, auth[1]))
    right = api_box[0] + api_box[2]
    for i, (target, label) in enumerate((("supabase", "SQL · S3 · JWKS"), ("cache", "RESP"))):
        if target not in cv.boxes:
            continue
        t = cv.boxes[target]
        sy, ty = api_y + 120 + i * 40, t[1] + t[3] // 2
        channel = right + 24 + i * 14
        cv.edge(f"f-api-{target}", "api", target, label, [(channel, sy), (channel, ty)], (right, sy), (t[0], ty))
    # External providers: straight across under Redis, then a short channel
    # in the gap before the provider column.
    for i, (target, top, h) in enumerate(external):
        t = cv.boxes[target]
        sy = api_y + 200 + i * 34
        channel_in = t[0] - 14 - i * 9
        label = {"ext-ai-providers": "LiteLLM (free-tier chain)", "ext-job-boards": "HTTPS pull (6-hourly sync)", "ext-saas": "email · errors · payments"}[target]
        cv.edge(f"f-api-{target}", "api", target, label, [(channel_in, sy), (channel_in, top + h // 2)], (right, sy), (t[0], top + h // 2), label_segment=0)
    band = cv.boxes["band"]
    deliveries = [
        ("f-deploy-web", "edge", "wrangler deploy (after CI)", edge_box[0] + edge_box[2] // 2),
        ("f-deploy-api", "platform", "Render deploy · Docker image", cx + 260),
        ("f-sync", "platform", "POST /jobs/sync/scheduled · every 6 h", cx + 620),
        ("f-secrets", "platform", "Infisical secret sync", cx + 960),
    ]
    for eid, target, label, x in deliveries:
        t = cv.boxes[target]
        cv.edge(eid, "band", target, label, [], (x, band[1]), (x, t[1] + t[3]), delivery=True)

    journey = sorted((f for f in features if f.get("step")), key=lambda f: f["step"])
    foot_y = band[1] + band[3] + 24
    cv.cell("journey", "<b>End-to-end hiring journey:</b> " + " → ".join(f"{STEP_MARKS[f['step'] - 1]} {html.escape(f['name'])}" for f in journey)
            + f'<br><font color="{MUTED}">Generated from repository evidence (routes, routers, roles, manifests, workflows) by <b>make architecture-sync</b> — edit tools/architecture/product.yaml, not this file.</font>',
            text + "fontSize=12;", (40, foot_y, CANVAS_W - 80, 44))
    return cv.xml(CANVAS_W, foot_y + 70)
