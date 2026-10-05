"""Render the architecture model as an uncompressed, deterministic draw.io file.

Layout is fixed and tiered so the same model always produces the same XML:
delivery/operations on top, the request path left to right in the middle, and
external providers underneath. Groups are provider boundaries; cards carry the
provider's own mark (Simple Icons, CC0) — never a look-alike from another cloud.

Edges are routed here rather than by draw.io's router, so every connection
gets its own port, channel and lane and the picture does not depend on the
draw.io version that renders it.
"""

from __future__ import annotations

import base64
import html
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ICONS = Path(__file__).parent / "icons"

CARD_W, CARD_GAP = 230, 12
CARD_H = {"ops": 58, "main": 58, "external": 46}
OPS_CARD_W, ACTOR_W = 190, 110
GROUP_PAD, GROUP_HEADER = 14, 40
LEFT, TOP = 40, 110
COLUMN_GAP = {1: 90, 2: 110, 3: 210}  # gap before each column; data stores get room for labels
ROW_GAP = 130  # minimum; grows with the lanes a row needs
LANE_STEP = {"ops": 24, "main": 14}  # ops labels sit on their drops, one lane apart
LANE_START = {"ops": 44, "main": 20}  # first lane below a row (ops: room for the label)
CHANNEL_STEP = 14

PALETTE = {
    "clients": "#5F6B7A",
    "cloudflare": "#F38020",
    "render": "#1F1F1F",
    "supabase": "#3ECF8E",
    "cache": "#FF4438",
    "ai-providers": "#8E75B2",
    "job-boards": "#2D7FF9",
    "saas": "#5F6B7A",
    "github": "#2088FF",
    "secrets": "#5F6B7A",
}
ROWS = ("ops", "main", "external")

Box = tuple[int, int, int, int]  # x, y, width, height (absolute)


@dataclass
class Node:
    id: str
    cell: str
    box: Box
    row: str
    column: int
    group: str
    first_in_group: bool


def _icon(name: str | None) -> str | None:
    if not name:
        return None
    data = base64.b64encode((ICONS / f"{name}.svg").read_bytes()).decode()
    return f"data:image/svg+xml,{data}"


def _style(**items: Any) -> str:
    return "".join(f"{k}={v};" for k, v in items.items())


def _row(group: dict[str, Any]) -> str:
    return group.get("row", "main")


# ── Layout ────────────────────────────────────────────────────────────────────


def _layout(model: dict[str, Any]) -> tuple[dict[str, Box], dict[str, Box], dict[str, int]]:
    """Absolute boxes for groups and cards, and the y of each row's top edge."""
    members: dict[str, list[dict[str, Any]]] = {g["id"]: [] for g in model["groups"]}
    for component in model["components"]:
        members[component["group"]].append(component)

    rel: dict[str, Box] = {}
    sizes: dict[str, tuple[int, int]] = {}
    for group in model["groups"]:
        row, items = _row(group), members[group["id"]]
        height = CARD_H[row]
        width = ACTOR_W if all(c["type"] == "actor" for c in items) else OPS_CARD_W if row == "ops" else CARD_W
        for i, component in enumerate(items):
            if row == "ops":
                rel[component["id"]] = (GROUP_PAD + i * (width + CARD_GAP), GROUP_HEADER, width, height)
            else:
                rel[component["id"]] = (GROUP_PAD, GROUP_HEADER + i * (height + CARD_GAP), width, height)
        n = len(items)
        if row == "ops":
            sizes[group["id"]] = (2 * GROUP_PAD + n * width + (n - 1) * CARD_GAP, GROUP_HEADER + height + GROUP_PAD)
        else:
            sizes[group["id"]] = (2 * GROUP_PAD + width, GROUP_HEADER + n * (height + CARD_GAP) - CARD_GAP + GROUP_PAD)

    # Column x positions follow the widest main-row group in each column.
    main_columns = sorted({g.get("column", 0) for g in model["groups"] if _row(g) == "main"})
    column_x: dict[int, int] = {}
    x = LEFT
    for column in main_columns:
        x += COLUMN_GAP.get(column, 90) if column_x else 0
        column_x[column] = x
        x += max(sizes[g["id"]][0] for g in model["groups"] if _row(g) == "main" and g.get("column", 0) == column)

    # Each row's gap must hold one lane per edge leaving it downwards, plus the
    # lane edges use to pass over the main row.
    row_of = {c["id"]: _row(next(g for g in model["groups"] if g["id"] == c["group"])) for c in model["components"]}
    row_of.update({g["id"]: _row(g) for g in model["groups"]})
    leaving = {
        row: sum(1 for c in model["connections"] if row_of[c["from"]] == row and ROWS.index(row_of[c["to"]]) > ROWS.index(row))
        for row in ROWS
    }

    def gap_after(row: str) -> int:
        return max(ROW_GAP, LANE_START.get(row, 20) + leaving[row] * LANE_STEP.get(row, 14) + 50)

    groups: dict[str, Box] = {}
    row_top: dict[str, int] = {}
    y = TOP
    for row in ROWS:
        in_row = [g for g in model["groups"] if _row(g) == row]
        if not in_row:
            continue
        row_top[row] = y
        if row == "main":
            columns: dict[int, list[dict[str, Any]]] = {}
            for group in in_row:
                columns.setdefault(group.get("column", 0), []).append(group)
            heights = {c: sum(sizes[g["id"]][1] for g in gs) + 24 * (len(gs) - 1) for c, gs in columns.items()}
            tallest = max(heights.values())
            for column, gs in sorted(columns.items()):
                gy = y + (tallest - heights[column]) // 2
                for group in gs:
                    w, h = sizes[group["id"]]
                    groups[group["id"]] = (column_x[column], gy, w, h)
                    gy += h + 24
            y += tallest + gap_after(row)
        else:
            x_end = 0
            for group in sorted(in_row, key=lambda g: g.get("column", 0)):
                w, h = sizes[group["id"]]
                gx = max(column_x.get(group.get("column", 1), LEFT), x_end + 50 if x_end else 0)
                groups[group["id"]] = (gx, y, w, h)
                x_end = gx + w
            y += max(sizes[g["id"]][1] for g in in_row) + gap_after(row)

    cards = {}
    for component in model["components"]:
        gx, gy, _, _ = groups[component["group"]]
        rx, ry, w, h = rel[component["id"]]
        cards[component["id"]] = (gx + rx, gy + ry, w, h)
    return groups, cards, row_top


# ── Routing ───────────────────────────────────────────────────────────────────


@dataclass
class Route:
    index: int
    source: Node
    target: Node
    exit_side: str
    entry_side: str
    kind: str  # "right", "down", "over"
    points: list[tuple[int, int]]
    exit_at: tuple[float, float] = (0.5, 0.5)
    entry_at: tuple[float, float] = (0.5, 0.5)


def _port(box: Box, side: str, fraction: float) -> tuple[int, int]:
    x, y, w, h = box
    return {
        "top": (round(x + w * fraction), y),
        "bottom": (round(x + w * fraction), y + h),
        "left": (x, round(y + h * fraction)),
        "right": (x + w, round(y + h * fraction)),
    }[side]


def _relative(side: str, fraction: float) -> tuple[float, float]:
    return {"top": (fraction, 0.0), "bottom": (fraction, 1.0), "left": (0.0, fraction), "right": (1.0, fraction)}[side]


def _route_all(model: dict[str, Any], nodes: dict[str, Node], groups: dict[str, Box], row_top: dict[str, int]) -> list[Route]:
    routes: list[Route] = []
    for i, connection in enumerate(model["connections"]):
        source, target = nodes[connection["from"]], nodes[connection["to"]]
        rows = list(ROWS)
        cards_below = any(n.group == source.group and n.id != source.id and n.id != n.group and n.box[1] > source.box[1] for n in nodes.values())
        if source.group == target.group and source.id != target.id:
            # Stacked in one group (e.g. API and worker on Render): a short drop.
            down = target.box[1] > source.box[1]
            routes.append(Route(i, source, target, "bottom" if down else "top", "top" if down else "bottom", "stack", []))
        elif rows.index(target.row) > rows.index(source.row):
            # Leave from the group's bottom edge when other cards sit below the source.
            origin = nodes[source.group] if cards_below else source
            entry = "top" if target.first_in_group else "left"
            routes.append(Route(i, origin, target, "bottom", entry, "down", []))
        elif target.row == source.row and target.column == source.column + 1:
            routes.append(Route(i, source, target, "right", "left", "right", []))
        else:  # same row, other columns in between: over the top
            routes.append(Route(i, source, target, "top", "top", "over", []))

    # Spread ports along each side, ordered by where the other end lies.
    def other_end(route: Route, side_owner: Node) -> tuple[int, int]:
        node = route.target if side_owner is route.source else route.source
        x, y, w, h = node.box
        return (x + w // 2, y + h // 2)

    sides: dict[tuple[str, str], list[tuple[Route, bool]]] = {}
    for route in routes:
        sides.setdefault((route.source.id, route.exit_side), []).append((route, True))
        sides.setdefault((route.target.id, route.entry_side), []).append((route, False))
    for (_, side), entries in sides.items():
        horizontal = side in ("top", "bottom")
        entries.sort(key=lambda e: other_end(e[0], e[0].source if e[1] else e[0].target)[0 if horizontal else 1])
        for k, (route, is_exit) in enumerate(entries):
            fraction = (k + 1) / (len(entries) + 1)
            if is_exit:
                route.exit_at = _relative(side, fraction)
            else:
                route.entry_at = _relative(side, fraction)

    # Straighten: a group entered from above takes the source's x when it can,
    # and a right-hand entry takes the exit's y when the card spans it.
    for route in routes:
        tx, ty, tw, th = route.target.box
        sx, sy = _port(route.source.box, route.exit_side, route.exit_at[0] if route.exit_side in ("top", "bottom") else route.exit_at[1])
        if route.kind == "down" and route.target.id == route.target.group and route.entry_side == "top":
            if tx + 20 <= sx <= tx + tw - 20:
                route.entry_at = (round((sx - tx) / tw, 4), 0.0)
            else:
                route.entry_at = (round(1 / 3, 4) if sx < tx else round(2 / 3, 4), 0.0)
        if route.kind == "stack" and tx + 8 <= sx <= tx + tw - 8:
            route.entry_at = (round((sx - tx) / tw, 4), route.entry_at[1])
        if route.kind == "right" and ty + 8 <= sy <= ty + th - 8:
            route.entry_at = (0.0, round((sy - ty) / th, 4))

    def start(route: Route) -> tuple[int, int]:
        return _port(route.source.box, route.exit_side, route.exit_at[0] if route.exit_side in ("top", "bottom") else route.exit_at[1])

    def end(route: Route) -> tuple[int, int]:
        return _port(route.target.box, route.entry_side, route.entry_at[0] if route.entry_side in ("top", "bottom") else route.entry_at[1])

    # Channels: vertical runs in the gap right of a source / left of a target group.
    right_channels: dict[str, int] = {}
    left_channels: dict[str, int] = {}
    lanes: dict[str, int] = {}

    for route in sorted((r for r in routes if r.kind == "right"), key=lambda r: start(r)[1]):
        (sx, sy), (tx, ty) = start(route), end(route)
        if sy == ty:
            continue
        k = right_channels.get(route.source.id, 0)
        right_channels[route.source.id] = k + 1
        cx = groups[route.source.group][0] + groups[route.source.group][2] + 24 + k * CHANNEL_STEP
        route.points = [(cx, sy), (cx, ty)]

    for route in (r for r in routes if r.kind == "over"):
        (sx, sy), (tx, ty) = start(route), end(route)
        lane = row_top["main"] - 24
        route.points = [(sx, lane), (tx, lane)]

    # Down routes: one horizontal lane each in the gap under the source's row.
    # Left-going edges take lanes left to right, right-going right to left,
    # so no lane crosses a sibling's vertical drop.
    down = [r for r in routes if r.kind == "down"]

    def landing_x(route: Route) -> int:
        if route.entry_side == "top":
            return end(route)[0]
        return groups[route.target.group][0] - 24

    for row in ROWS:
        in_gap = [r for r in down if r.source.row == row]
        if not in_gap:
            continue
        bottom = max(groups[g][1] + groups[g][3] for g in groups if any(n.group == g and n.row == row for n in nodes.values()))
        lefts = sorted((r for r in in_gap if landing_x(r) < start(r)[0]), key=lambda r: start(r)[0])
        rights = sorted((r for r in in_gap if landing_x(r) >= start(r)[0]), key=lambda r: -start(r)[0])
        for order in (lefts, rights):
            for route in order:
                lanes[row] = lanes.get(row, 0) + 1
                lane_y = bottom + LANE_START.get(row, 20) + (lanes[row] - 1) * LANE_STEP.get(row, 14)
                (sx, _), (tx, ty) = start(route), end(route)
                if route.entry_side == "top":
                    route.points = [] if sx == tx else [(sx, lane_y), (tx, lane_y)]
                else:
                    k = left_channels.get(route.target.group, 0)
                    left_channels[route.target.group] = k + 1
                    cx = groups[route.target.group][0] - 24 - k * CHANNEL_STEP
                    route.points = [(sx, lane_y), (cx, lane_y), (cx, ty)]
    return routes


def _label_position(path: list[tuple[int, int]], on_drop: bool) -> float:
    """draw.io relative label x (-1 source .. 1 target).

    Normally the middle of the longest segment; for edges leaving the ops row
    (several may share one source card), just above the first bend, so
    siblings' labels sit at their own lane heights.
    """
    lengths = [abs(b[0] - a[0]) + abs(b[1] - a[1]) for a, b in zip(path, path[1:], strict=False)]
    total = sum(lengths) or 1
    if on_drop and len(lengths) > 1:
        return round(2 * max(lengths[0] - 18, lengths[0] / 2) / total - 1, 4)
    longest = max(range(len(lengths)), key=lambda i: (lengths[i], -i))
    middle = sum(lengths[:longest]) + lengths[longest] / 2
    return round(2 * middle / total - 1, 4)


# ── Rendering ─────────────────────────────────────────────────────────────────


def _card_label(component: dict[str, Any], show_technology: bool) -> str:
    name = html.escape(component["name"])
    if component["status"] == "disabled":
        name += " <i>(disabled)</i>"
    lines = [f"<b>{name}</b>"]
    if show_technology and component.get("technology"):
        lines.append(f'<font style="font-size:10px" color="#5F6B7A">{html.escape(component["technology"])}</font>')
    return "<br>".join(lines)


def render(model: dict[str, Any]) -> str:
    groups, cards, row_top = _layout(model)
    group_rows = {g["id"]: _row(g) for g in model["groups"]}
    group_columns = {g["id"]: g.get("column", 0) for g in model["groups"]}
    members: dict[str, list[dict[str, Any]]] = {}
    for component in model["components"]:
        members.setdefault(component["group"], []).append(component)

    nodes: dict[str, Node] = {}
    for component in model["components"]:
        group = component["group"]
        nodes[component["id"]] = Node(
            component["id"], component["id"], cards[component["id"]], group_rows[group], group_columns[group], group,
            members[group][0]["id"] == component["id"],
        )
    for group_id, box in groups.items():
        nodes[group_id] = Node(group_id, f"group-{group_id}", box, group_rows[group_id], group_columns[group_id], group_id, True)

    mxfile = ET.Element("mxfile", host="remote-ai-platform", agent="tools/architecture", type="device")
    diagram = ET.SubElement(mxfile, "diagram", id="architecture", name="Architecture")
    width = max(x + w for x, _, w, _ in groups.values()) + 40
    height = max(y + h for _, y, _, h in groups.values()) + 90
    graph = ET.SubElement(
        diagram,
        "mxGraphModel",
        grid="1", gridSize="10", guides="1", tooltips="1", connect="1", arrows="1", fold="1",
        page="1", pageScale="1", pageWidth=str(width), pageHeight=str(height), math="0", shadow="0",
        background="#FFFFFF",
    )
    root = ET.SubElement(graph, "root")
    ET.SubElement(root, "mxCell", id="0")
    ET.SubElement(root, "mxCell", attrib={"id": "1", "parent": "0"})

    def vertex(cell_id: str, value: str, style: str, box: Box, parent: str = "1", origin: tuple[int, int] = (0, 0)) -> None:
        cell = ET.SubElement(
            root, "mxCell", attrib={"id": cell_id, "value": value, "style": style, "vertex": "1", "parent": parent}
        )
        x, y, w, h = box
        ET.SubElement(
            cell, "mxGeometry", x=str(x - origin[0]), y=str(y - origin[1]), width=str(w), height=str(h), attrib={"as": "geometry"}
        )

    system = model["system"]
    vertex(
        "title",
        f'<b style="font-size:20px">{html.escape(system["name"])} — solution architecture</b><br>'
        f'<font color="#5F6B7A">{html.escape(system.get("description", ""))}</font>',
        _style(text=1, html=1, strokeColor="none", fillColor="none", align="left", verticalAlign="top", whiteSpace="wrap", fontSize=12, fontColor="#1F2937"),
        (LEFT, 24, width - 2 * LEFT, 56),
    )

    for group in model["groups"]:
        color = PALETTE.get(group["id"], "#5F6B7A")
        icon = _icon(group.get("icon"))
        actors_only = all(c["type"] == "actor" for c in members[group["id"]])
        style = _style(
            shape="label" if icon else "rect",
            rounded=1, arcSize=6, absoluteArcSize=1, container=1, collapsible=0, html=1, whiteSpace="wrap",
            fillColor="none" if actors_only else "#FFFFFF",
            strokeColor=color, strokeWidth=1.5, dashed=1 if actors_only else 0,
            align="left", verticalAlign="top", spacingLeft=40 if icon else 12, spacingTop=4,
            fontColor="#1F2937", fontSize=12,
            **({"image": icon, "imageWidth": 22, "imageHeight": 22, "imageAlign": "left", "imageVerticalAlign": "top"} if icon else {}),
        )
        vertex(f"group-{group['id']}", f"<b>{html.escape(group['name'])}</b>", style, groups[group["id"]])

    for component in model["components"]:
        group = component["group"]
        origin = groups[group][:2]
        icon = _icon(component.get("icon"))
        disabled = component["status"] == "disabled"
        common = {
            "html": 1, "whiteSpace": "wrap", "fontColor": "#1F2937", "fontSize": 12,
            "fillColor": "#F8FAFC" if disabled else "#FFFFFF",
            "strokeColor": "#94A3B8" if disabled else "#CBD5E1",
            "dashed": 1 if disabled else 0, "opacity": 60 if disabled else 100,
        }
        if component["type"] == "actor":
            x, y, w, h = cards[component["id"]]
            box = (x + (w - 32) // 2, y + 2, 32, h - 18)
            style = _style(shape="actor", **common, verticalLabelPosition="bottom", verticalAlign="top", align="center")
            value = f"<b>{html.escape(component['name'])}</b>"
        else:
            box = cards[component["id"]]
            style = _style(
                shape="label", rounded=1, arcSize=8, absoluteArcSize=1, **common,
                align="left", verticalAlign="middle", spacingLeft=46 if icon else 14,
                **({"image": icon, "imageWidth": 28, "imageHeight": 28, "imageAlign": "left", "imageVerticalAlign": "middle"} if icon else {}),
            )
            technologies = {c.get("technology") for c in members[group]}
            value = _card_label(component, show_technology=len(technologies) > 1 or len(members[group]) == 1)
        vertex(component["id"], value, style, box, parent=f"group-{group}", origin=origin)

    statuses = {c["id"]: c["status"] for c in model["components"]}
    for route in sorted(_route_all(model, nodes, groups, row_top), key=lambda r: r.index):
        connection = model["connections"][route.index]
        delivery = route.source.row == "ops"
        disabled = "disabled" in (statuses.get(route.source.id), statuses.get(route.target.id))
        style = _style(
            edgeStyle="none", rounded=1, html=1,
            exitX=route.exit_at[0], exitY=route.exit_at[1], exitPerimeter=0,
            entryX=route.entry_at[0], entryY=route.entry_at[1], entryPerimeter=0,
            endArrow="block", endFill=1, endSize=6,
            strokeColor="#2088FF" if delivery else "#475569", strokeWidth=1.25,
            dashed=1 if delivery or disabled else 0,
            fontSize=10, fontColor="#334155", labelBackgroundColor="#FFFFFF",
        )
        start = _port(route.source.box, route.exit_side, route.exit_at[0] if route.exit_side in ("top", "bottom") else route.exit_at[1])
        finish = _port(route.target.box, route.entry_side, route.entry_at[0] if route.entry_side in ("top", "bottom") else route.entry_at[1])
        cell = ET.SubElement(
            root,
            "mxCell",
            attrib={
                "id": f"edge-{route.index:02d}-{connection['from']}-{connection['to']}",
                "value": html.escape(connection.get("label", "")),
                "style": style, "edge": "1", "parent": "1",
                "source": route.source.cell, "target": route.target.cell,
            },
        )
        geometry = ET.SubElement(
            cell, "mxGeometry", x=str(_label_position([start, *route.points, finish], on_drop=delivery)), relative="1", attrib={"as": "geometry"}
        )
        if route.points:
            points = ET.SubElement(geometry, "Array", attrib={"as": "points"})
            for px, py in route.points:
                ET.SubElement(points, "mxPoint", x=str(px), y=str(py))

    vertex(
        "legend",
        '<font color="#475569">━━ runtime request&nbsp;&nbsp;&nbsp;'
        '<font color="#2088FF">╍╍ delivery &amp; operations</font>&nbsp;&nbsp;&nbsp;'
        "dashed card = present in code, switched off&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;"
        "Generated from repository evidence by <b>make architecture-sync</b> — "
        "edit tools/architecture/catalog.yaml, not this file.</font>",
        _style(text=1, html=1, strokeColor="none", fillColor="none", align="left", verticalAlign="middle", whiteSpace="wrap", fontSize=11),
        (LEFT, height - 60, width - 2 * LEFT, 30),
    )

    ET.indent(mxfile, space="  ")
    return ET.tostring(mxfile, encoding="unicode") + "\n"
