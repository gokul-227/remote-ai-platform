"""
/rap subcommands: the staff console, from Slack.

Each handler calls the same /api/v1 staff endpoints as the console through
`StaffApi` (in-process, as the linked staff member), so permissions, validation
and audit are shared. Commands marked `confirm` answer first with a Block Kit
confirmation button (see security.confirm_token) and only run once clicked.

The command table here is the reference in docs/operations/slack.md; keep the
two in step.
"""

import asyncio
import shlex
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from app.domains.slack.api import StaffApi

DEFAULT_REASON = "Slack /rap"


class UsageError(Exception):
    pass


@dataclass
class Ctx:
    api: StaffApi
    slack_user_id: str
    user_id: uuid.UUID
    email: str = ""


Handler = Callable[[Ctx, list[str]], Awaitable[str]]


@dataclass
class Command:
    name: str  # "users suspend"
    usage: str  # argument synopsis
    help: str
    handler: Handler
    confirm: bool = False
    min_args: int = 0
    aliases: tuple[str, ...] = field(default_factory=tuple)


REGISTRY: dict[str, Command] = {}


def command(
    name: str,
    usage: str = "",
    help: str = "",
    *,
    confirm: bool = False,
    min_args: int = 0,
    aliases: tuple[str, ...] = (),
) -> Callable[[Handler], Handler]:
    def wrap(fn: Handler) -> Handler:
        cmd = Command(name, usage, help, fn, confirm, min_args, aliases)
        REGISTRY[name] = cmd
        for alias in aliases:
            REGISTRY[alias] = cmd
        return fn

    return wrap


def tokenize(text: str) -> list[str]:
    try:
        return shlex.split(text.strip())
    except ValueError:
        return text.strip().split()


def parse(text: str) -> tuple[Command | None, list[str]]:
    """Longest matching command name (two words, then one) and its arguments."""
    words = tokenize(text)
    for n in (2, 1):
        if len(words) >= n:
            key = " ".join(w.lower() for w in words[:n])
            if key in REGISTRY:
                return REGISTRY[key], words[n:]
    return None, words


# ── formatting ─────────────────────────────────────────────────────────────


def _val(v: Any) -> str:
    if v is None:
        return "—"
    if isinstance(v, bool):
        return "yes" if v else "no"
    if isinstance(v, float):
        return f"{v:,.2f}"
    if isinstance(v, dict):
        return ", ".join(f"{k}={_val(x)}" for k, x in list(v.items())[:8])
    if isinstance(v, list):
        return ", ".join(_val(x) for x in v[:8]) + (" …" if len(v) > 8 else "")
    return str(v)[:200]


def rows(items: Any, keys: list[str], title: str, limit: int = 15) -> str:
    if isinstance(items, dict):
        items = items.get("items") or items.get("results") or []
    items = list(items or [])
    if not items:
        return f"*{title}*: nothing found."
    lines = [f"*{title}* ({len(items)}{'+' if len(items) > limit else ''})"]
    for it in items[:limit]:
        lines.append("• " + " · ".join(f"{_val(it.get(k))}" for k in keys if k in it))
    if len(items) > limit:
        lines.append(f"_…{len(items) - limit} more; open the console for the rest._")
    return "\n".join(lines)


def obj(data: Any, title: str, keys: list[str] | None = None) -> str:
    if not isinstance(data, dict):
        return f"*{title}*: {_val(data)}"
    pairs = [(k, data[k]) for k in (keys or list(data)) if k in data]
    return f"*{title}*\n" + "\n".join(f"• *{k}*: {_val(v)}" for k, v in pairs[:25])


def reason(args: list[str], start: int) -> str:
    text = " ".join(args[start:]).strip()
    return text if len(text) >= 3 else DEFAULT_REASON


def _uuid(value: str, what: str = "id") -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError as exc:
        raise UsageError(f"`{value}` is not a valid {what}") from exc


async def user_ref(ctx: Ctx, ref: str) -> dict[str, Any]:
    """A user by id or by email/name search (must match exactly one)."""
    try:
        return {"id": str(uuid.UUID(ref))}  # the endpoint itself answers 404 for an unknown id
    except ValueError:
        pass
    found = await ctx.api.get("/admin/users", q=ref, limit=100)
    exact = [u for u in found if str(u.get("email", "")).lower() == ref.lower()]
    picks = exact or found
    if len(picks) != 1:
        raise UsageError(f"`{ref}` matches {len(picks)} users; use the user id or exact email.")
    return dict(picks[0])


USER_KEYS = ["id", "email", "full_name", "role", "is_active"]


# ── status / health ───────────────────────────────────────────────────────


@command("status", "", "API, DB, Redis, worker, queue depth, last deploy SHA", aliases=("health",))
async def status(ctx: Ctx, args: list[str]) -> str:
    results: tuple[Any, ...] = await asyncio.gather(
        ctx.api.get("/admin/health/details"),
        ctx.api.get("/admin/background/overview"),
        ctx.api.get("/health/version"),
        return_exceptions=True,
    )
    health, overview, version = results
    lines = ["*Platform status*"]
    if isinstance(health, dict):
        lines.append(f"• overall: *{health.get('overall_status')}*")
        for s in health.get("services") or []:
            lines.append(f"• {s.get('name')}: {s.get('status')}")
    else:
        lines.append(f"• health: unavailable ({type(health).__name__})")
    if isinstance(overview, dict):
        runs = overview.get("runs_by_status") or {}
        queued = int(runs.get("QUEUED", 0)) + int(runs.get("RETRYING", 0))
        lines.append(
            f"• queue depth: {queued} queued/retrying, {runs.get('RUNNING', 0)} running, "
            f"{overview.get('undispatched_outbox', 0)} undispatched, "
            f"{overview.get('dead_letters_open', 0)} dead letters"
        )
        for kind, live in (overview.get("liveness") or {}).items():
            lines.append(
                f"• {kind}: {live.get('fresh', 0)}/{live.get('count', 0)} fresh heartbeats"
            )
    if isinstance(version, dict):
        lines.append(
            f"• deployed: `{str(version.get('git_sha', ''))[:12]}` "
            f"v{version.get('version')} ({version.get('environment')})"
        )
    return "\n".join(lines)


@command("stats", "", "Platform totals (console overview)", aliases=("overview",))
async def stats(ctx: Ctx, args: list[str]) -> str:
    return obj(await ctx.api.get("/admin/stats"), "Platform stats")


# ── users ─────────────────────────────────────────────────────────────────


@command("users find", "<email or name>", "Search accounts", min_args=1)
async def users_find(ctx: Ctx, args: list[str]) -> str:
    return rows(await ctx.api.get("/admin/users", q=" ".join(args), limit=25), USER_KEYS, "Users")


@command("users suspended", "", "Suspended accounts (restricted)")
async def users_suspended(ctx: Ctx, args: list[str]) -> str:
    return rows(
        await ctx.api.get("/admin/users", is_active="false", limit=50), USER_KEYS, "Suspended"
    )


@command("users view", "<id|email>", "One account, its entitlements", min_args=1)
async def users_view(ctx: Ctx, args: list[str]) -> str:
    user = await user_ref(ctx, args[0])
    out = obj(user, "User", USER_KEYS + ["created_at", "last_login_at"])
    try:
        ents = await ctx.api.get("/admin/billing/entitlements", user_id=user["id"], limit=20)
        out += "\n" + rows(ents, ["key", "quantity", "expires_at", "source"], "Entitlements")
    except Exception:  # billing scope may be outside this staff role
        pass
    return out


async def _set_active(ctx: Ctx, args: list[str], active: bool) -> str:
    user = await user_ref(ctx, args[0])
    body = {"is_active": active, "reason": reason(args, 1)}
    res = await ctx.api.patch(f"/admin/users/{user['id']}/status", body)
    return f":white_check_mark: {res.get('email')} is now {'active' if active else 'suspended'}."


@command("users suspend", "<id|email> [reason]", "Suspend and sign out", confirm=True, min_args=1)
async def users_suspend(ctx: Ctx, args: list[str]) -> str:
    return await _set_active(ctx, args, False)


@command("users unsuspend", "<id|email> [reason]", "Reactivate an account", min_args=1)
async def users_unsuspend(ctx: Ctx, args: list[str]) -> str:
    return await _set_active(ctx, args, True)


@command(
    "users role",
    "<id|email> <ENGINEER|COMPANY|ADMIN> [reason]",
    "Change account role",
    confirm=True,
    min_args=2,
)
async def users_role(ctx: Ctx, args: list[str]) -> str:
    user = await user_ref(ctx, args[0])
    body = {"role": args[1].upper(), "reason": reason(args, 2)}
    res = await ctx.api.patch(f"/admin/users/{user['id']}/role", body)
    return f":white_check_mark: {res.get('email')} is now {res.get('role')}."


@command("users signout", "<id|email> [reason]", "Revoke every session", confirm=True, min_args=1)
async def users_signout(ctx: Ctx, args: list[str]) -> str:
    user = await user_ref(ctx, args[0])
    await ctx.api.post(f"/admin/users/{user['id']}/revoke-sessions", {"reason": reason(args, 1)})
    return f":white_check_mark: Sessions revoked for {user.get('email', user['id'])}."


@command("users delete", "<id|email>", "Permanently delete an account", confirm=True, min_args=1)
async def users_delete(ctx: Ctx, args: list[str]) -> str:
    user = await user_ref(ctx, args[0])
    await ctx.api.delete(f"/admin/users/{user['id']}")
    return f":wastebasket: Deleted {user.get('email', user['id'])}."


@command("staff list", "", "Staff accounts and their roles")
async def staff_list(ctx: Ctx, args: list[str]) -> str:
    return rows(await ctx.api.get("/admin/staff-roles"), ["email", "user_id", "roles"], "Staff")


@command(
    "staff roles",
    "<id|email> <role,role> [reason]",
    "Set staff roles (super_admin only)",
    confirm=True,
    min_args=2,
)
async def staff_roles(ctx: Ctx, args: list[str]) -> str:
    user = await user_ref(ctx, args[0])
    roles = [r.strip() for r in args[1].split(",") if r.strip()]
    res = await ctx.api.put(
        f"/admin/staff-roles/{user['id']}", {"roles": roles, "reason": reason(args, 2)}
    )
    return f":white_check_mark: Staff roles now {_val(res.get('roles'))}."


@command("verifications list", "", "Identity verification queue")
async def verifications_list(ctx: Ctx, args: list[str]) -> str:
    return rows(
        await ctx.api.get("/trust/verifications"),
        ["id", "user_id", "verification_type", "status", "created_at"],
        "Verifications",
    )


@command(
    "verifications review", "<id> <verified|rejected> [note]", "Decide a verification", min_args=2
)
async def verifications_review(ctx: Ctx, args: list[str]) -> str:
    vid = _uuid(args[0])
    body = {"status": args[1].upper(), "verifier_notes": " ".join(args[2:]) or None}
    res = await ctx.api.patch(f"/trust/verifications/{vid}/review", body)
    return f":white_check_mark: Verification {vid} is {res.get('status')}."


@command("companies list", "[query]", "Company directory")
async def companies_list(ctx: Ctx, args: list[str]) -> str:
    items = await ctx.api.get("/companies/public", limit=100)
    q = " ".join(args).lower()
    if q:
        items = [c for c in items if q in str(c.get("name", "")).lower()]
    return rows(items, ["id", "name", "industry", "location"], "Companies")


# ── jobs ──────────────────────────────────────────────────────────────────

JOB_KEYS = ["id", "title", "company_name", "source", "is_active"]


@command("jobs search", "<query>", "Find listings (hidden ones included)", min_args=1)
async def jobs_search(ctx: Ctx, args: list[str]) -> str:
    return rows(await ctx.api.get("/admin/jobs", q=" ".join(args), limit=25), JOB_KEYS, "Jobs")


@command("jobs hidden", "", "Hidden listings")
async def jobs_hidden(ctx: Ctx, args: list[str]) -> str:
    return rows(await ctx.api.get("/admin/jobs", active="false", limit=25), JOB_KEYS, "Hidden jobs")


async def _job_active(ctx: Ctx, args: list[str], active: bool) -> str:
    jid = _uuid(args[0], "job id")
    await ctx.api.patch(f"/admin/jobs/{jid}/status", {"is_active": active})
    return f":white_check_mark: Job {jid} {'shown' if active else 'hidden'}."


@command("jobs hide", "<job id>", "Hide a listing", min_args=1)
async def jobs_hide(ctx: Ctx, args: list[str]) -> str:
    return await _job_active(ctx, args, False)


@command("jobs unhide", "<job id>", "Show a hidden listing", min_args=1)
async def jobs_unhide(ctx: Ctx, args: list[str]) -> str:
    return await _job_active(ctx, args, True)


@command("jobs delete", "<job id>", "Delete a listing", confirm=True, min_args=1)
async def jobs_delete(ctx: Ctx, args: list[str]) -> str:
    jid = _uuid(args[0], "job id")
    await ctx.api.delete(f"/admin/jobs/{jid}")
    return f":wastebasket: Job {jid} deleted."


@command("contracts list", "[status]", "Freelancing contracts")
async def contracts_list(ctx: Ctx, args: list[str]) -> str:
    data = await ctx.api.get("/admin/contracts", limit=50, status=args[0].upper() if args else None)
    return rows(data, ["id", "title", "status", "created_at"], "Contracts")


@command("projects list", "", "Project portfolio")
async def projects_list(ctx: Ctx, args: list[str]) -> str:
    data = await ctx.api.get("/admin/operations/projects")
    return rows(data, ["id", "title", "status", "owner_email"], "Projects")


@command("projects summary", "", "Delivery operations summary")
async def projects_summary(ctx: Ctx, args: list[str]) -> str:
    return obj(await ctx.api.get("/admin/operations/summary"), "Delivery operations")


# ── sources and imports ───────────────────────────────────────────────────


@command("sources list", "", "Job sources, schedule and state")
async def sources_list(ctx: Ctx, args: list[str]) -> str:
    return rows(
        await ctx.api.get("/admin/background/sources"),
        ["name", "enabled", "cron", "last_success_at", "consecutive_failures"],
        "Sources",
        limit=40,
    )


async def _patch_source(ctx: Ctx, name: str, body: dict[str, Any]) -> dict[str, Any]:
    return dict(await ctx.api.patch(f"/admin/background/sources/{name}", body))


@command("sources pause", "<name> [reason]", "Stop scheduling a source", min_args=1)
async def sources_pause(ctx: Ctx, args: list[str]) -> str:
    await _patch_source(ctx, args[0], {"enabled": False, "reason": reason(args, 1)})
    return f":double_vertical_bar: Source {args[0]} paused."


@command("sources resume", "<name> [reason]", "Resume a source", min_args=1)
async def sources_resume(ctx: Ctx, args: list[str]) -> str:
    await _patch_source(ctx, args[0], {"enabled": True, "reason": reason(args, 1)})
    return f":arrow_forward: Source {args[0]} resumed."


@command("sources run", "<name> [reason]", "Run an import now", min_args=1)
async def sources_run(ctx: Ctx, args: list[str]) -> str:
    run = await ctx.api.post(
        f"/admin/background/sources/{args[0]}/run", {"reason": reason(args, 1)}
    )
    return f":rocket: Import {args[0]} queued (run `{run.get('id')}`)."


@command("sources cron", '<name> "<cron>" [reason]', "Set a source schedule", min_args=2)
async def sources_cron(ctx: Ctx, args: list[str]) -> str:
    res = await _patch_source(ctx, args[0], {"cron": args[1], "reason": reason(args, 2)})
    return f":calendar: Source {args[0]} now runs `{res.get('cron')}`."


@command("sources boards", "<name>", "ATS boards of a source", min_args=1)
async def sources_boards(ctx: Ctx, args: list[str]) -> str:
    data = await ctx.api.get(f"/admin/background/sources/{args[0]}/boards")
    return rows(data, ["token", "enabled", "status", "last_checked_at"], f"Boards of {args[0]}")


RUN_KEYS = ["id", "task_name", "status", "attempts", "created_at", "error"]


@command("imports runs", "[status]", "Latest import runs")
async def imports_runs(ctx: Ctx, args: list[str]) -> str:
    data = await ctx.api.get(
        "/admin/background/runs",
        task="jobs.import_source",
        status=args[0].upper() if args else None,
        limit=20,
    )
    return rows(data, RUN_KEYS, "Import runs")


@command("imports failures", "", "Failing and dead import runs")
async def imports_failures(ctx: Ctx, args: list[str]) -> str:
    dead, retrying = await asyncio.gather(
        ctx.api.get("/admin/background/runs", status="DEAD", limit=15),
        ctx.api.get("/admin/background/runs", status="RETRYING", limit=15),
    )
    return rows(list(dead) + list(retrying), RUN_KEYS, "Failing runs")


@command("imports deadletters", "", "Open dead letters", aliases=("tasks deadletters",))
async def imports_deadletters(ctx: Ctx, args: list[str]) -> str:
    data = await ctx.api.get("/admin/background/dead-letters", limit=25)
    return rows(data, ["id", "task_name", "created_at", "retried_at", "error"], "Dead letters")


@command("imports retry", "<dead letter id> [reason]", "Retry a dead letter", min_args=1)
async def imports_retry(ctx: Ctx, args: list[str]) -> str:
    did = _uuid(args[0], "dead letter id")
    run = await ctx.api.post(
        f"/admin/background/dead-letters/{did}/retry", {"reason": reason(args, 1)}
    )
    return f":repeat: Dead letter retried as run `{run.get('id')}`."


@command("tasks overview", "", "Background processing: runs, outbox, heartbeats")
async def tasks_overview(ctx: Ctx, args: list[str]) -> str:
    return obj(await ctx.api.get("/admin/background/overview"), "Background processing")


@command("tasks runs", "[status] [task]", "Recent background runs")
async def tasks_runs(ctx: Ctx, args: list[str]) -> str:
    data = await ctx.api.get(
        "/admin/background/runs",
        status=args[0].upper() if args else None,
        task=args[1] if len(args) > 1 else None,
        limit=20,
    )
    return rows(data, RUN_KEYS, "Background runs")


# ── flags ─────────────────────────────────────────────────────────────────


@command("flags list", "", "Feature flags and overrides")
async def flags_list(ctx: Ctx, args: list[str]) -> str:
    return rows(
        await ctx.api.get("/admin/feature-flags/state"),
        ["name", "effective", "override", "env_default"],
        "Feature flags",
        limit=60,
    )


@command(
    "flags set",
    "<name> <on|off|default> [reason]",
    "Override a feature flag",
    confirm=True,
    min_args=2,
)
async def flags_set(ctx: Ctx, args: list[str]) -> str:
    value = {"on": True, "true": True, "off": False, "false": False, "default": None}.get(
        args[1].lower(), "?"
    )
    if value == "?":
        raise UsageError("Flag value must be on, off or default.")
    res = await ctx.api.put(
        f"/admin/feature-flags/{args[0]}", {"enabled": value, "reason": reason(args, 2)}
    )
    return f":triangular_flag_on_post: {args[0]} is now {'on' if res.get('effective') else 'off'}."


# ── moderation ────────────────────────────────────────────────────────────


@command("reports queue", "", "Open moderation reports", aliases=("moderation queue",))
async def reports_queue(ctx: Ctx, args: list[str]) -> str:
    data = [
        r
        for r in await ctx.api.get("/moderation/reports")
        if r.get("status") in {"OPEN", "PENDING", None}
    ]
    return rows(data, ["id", "target_type", "target_id", "reason", "created_at"], "Review queue")


@command("reports history", "", "Decided reports")
async def reports_history(ctx: Ctx, args: list[str]) -> str:
    data = [
        r
        for r in await ctx.api.get("/moderation/reports")
        if r.get("status") in {"RESOLVED", "DISMISSED"}
    ]
    return rows(
        data, ["id", "target_type", "status", "decision", "reviewed_at"], "Moderation history"
    )


@command(
    "reports resolve",
    "<id> <HIDE_JOB|SUSPEND_USER|REMOVE_POST|NO_ACTION> [note]",
    "Resolve a report",
    confirm=True,
    min_args=2,
    aliases=("moderation resolve",),
)
async def reports_resolve(ctx: Ctx, args: list[str]) -> str:
    rid = _uuid(args[0], "report id")
    body = {"status": "RESOLVED", "decision": args[1].upper(), "note": " ".join(args[2:]) or None}
    await ctx.api.patch(f"/moderation/reports/{rid}", body)
    return f":white_check_mark: Report {rid} resolved ({args[1].upper()})."


@command("reports dismiss", "<id> [note]", "Dismiss a report", min_args=1)
async def reports_dismiss(ctx: Ctx, args: list[str]) -> str:
    rid = _uuid(args[0], "report id")
    body = {"status": "DISMISSED", "decision": "NO_ACTION", "note": " ".join(args[1:]) or None}
    await ctx.api.patch(f"/moderation/reports/{rid}", body)
    return f":white_check_mark: Report {rid} dismissed."


# ── billing ───────────────────────────────────────────────────────────────


def _eur(cents: Any) -> str:
    try:
        return f"€{int(cents) / 100:,.2f}"
    except (TypeError, ValueError):
        return _val(cents)


@command("billing revenue", "", "Revenue summary", aliases=("revenue",))
async def billing_revenue(ctx: Ctx, args: list[str]) -> str:
    return obj(await ctx.api.get("/admin/billing/revenue"), "Revenue")


@command("billing subs", "[status]", "Subscriptions", aliases=("billing subscriptions",))
async def billing_subs(ctx: Ctx, args: list[str]) -> str:
    data = await ctx.api.get(
        "/admin/billing/subscriptions", status=args[0] if args else None, limit=25
    )
    return rows(
        data, ["id", "plan_slug", "status", "user_id", "current_period_end"], "Subscriptions"
    )


@command("billing purchases", "[status]", "Purchases")
async def billing_purchases(ctx: Ctx, args: list[str]) -> str:
    data = await ctx.api.get("/admin/billing/purchases", status=args[0] if args else None, limit=25)
    return rows(data, ["id", "plan_slug", "status", "amount_total", "created_at"], "Purchases")


@command("billing entitlements", "[user id|email]", "Entitlements")
async def billing_entitlements(ctx: Ctx, args: list[str]) -> str:
    uid = (await user_ref(ctx, args[0]))["id"] if args else None
    data = await ctx.api.get("/admin/billing/entitlements", user_id=uid, limit=50)
    return rows(
        data, ["id", "user_id", "key", "quantity", "expires_at", "revoked_at"], "Entitlements"
    )


@command("billing plans", "", "Price list", aliases=("billing prices",))
async def billing_plans(ctx: Ctx, args: list[str]) -> str:
    data = await ctx.api.get("/admin/billing/plans")
    for p in data:
        p["price"] = _eur(p.get("price_cents"))
    return rows(data, ["slug", "name", "price", "mode", "is_active"], "Plans", limit=40)


@command(
    "billing refund",
    "<purchase id> [amount cents] [reason]",
    "Refund through Stripe",
    confirm=True,
    min_args=1,
)
async def billing_refund(ctx: Ctx, args: list[str]) -> str:
    pid = _uuid(args[0], "purchase id")
    amount = int(args[1]) if len(args) > 1 and args[1].isdigit() else None
    rest = 2 if amount is not None else 1
    res = await ctx.api.post(
        f"/admin/billing/purchases/{pid}/refund",
        {"amount_cents": amount, "reason": reason(args, rest)},
    )
    return f":leftwards_arrow_with_hook: Refund {res.get('refund_id')} {res.get('status')} ({_eur(res.get('amount'))})."


@command(
    "billing grant",
    "<user id|email> <key> [quantity] [days] [reason]",
    "Grant an entitlement",
    confirm=True,
    min_args=2,
)
async def billing_grant(ctx: Ctx, args: list[str]) -> str:
    user = await user_ref(ctx, args[0])
    nums = [int(a) for a in args[2:4] if a.isdigit()]
    body = {
        "user_id": user["id"],
        "key": args[1],
        "quantity": nums[0] if nums else 1,
        "days": nums[1] if len(nums) > 1 else None,
        "reason": reason(args, 2 + len(nums)),
    }
    res = await ctx.api.post("/admin/billing/entitlements", body)
    return (
        f":gift: Granted {res.get('key')} x{res.get('quantity')} (entitlement `{res.get('id')}`)."
    )


@command(
    "billing revoke", "<entitlement id> [reason]", "Revoke an entitlement", confirm=True, min_args=1
)
async def billing_revoke(ctx: Ctx, args: list[str]) -> str:
    eid = _uuid(args[0], "entitlement id")
    await ctx.api.post(f"/admin/billing/entitlements/{eid}/revoke", {"reason": reason(args, 1)})
    return f":no_entry_sign: Entitlement {eid} revoked."


@command(
    "billing price",
    "<plan slug> <price cents> [reason]",
    "Change a price",
    confirm=True,
    min_args=2,
)
async def billing_price(ctx: Ctx, args: list[str]) -> str:
    if not args[1].isdigit():
        raise UsageError("Price must be whole cents, e.g. 1900 for €19.00.")
    res = await ctx.api.patch(
        f"/admin/billing/plans/{args[0]}", {"price_cents": int(args[1]), "reason": reason(args, 2)}
    )
    return f":label: {res.get('slug')} now costs {_eur(res.get('price_cents'))}."


@command(
    "billing fulfil", "<purchase id> <queued|done> [reason]", "Set fulfilment status", min_args=2
)
async def billing_fulfil(ctx: Ctx, args: list[str]) -> str:
    pid = _uuid(args[0], "purchase id")
    res = await ctx.api.post(
        f"/admin/billing/purchases/{pid}/fulfilment",
        {"fulfilment_status": args[1].lower(), "reason": reason(args, 2)},
    )
    return f":package: Purchase {pid} fulfilment {res.get('fulfilment_status')}."


# ── announcements / broadcast ─────────────────────────────────────────────


@command("announce list", "", "Announcements")
async def announce_list(ctx: Ctx, args: list[str]) -> str:
    data = await ctx.api.get("/admin/announcements")
    return rows(data, ["id", "severity", "title", "active"], "Announcements")


@command(
    "announce create",
    "<INFO|WARNING|CRITICAL> <title> | <body>",
    "Broadcast a banner to every member",
    confirm=True,
    min_args=2,
    aliases=("broadcast",),
)
async def announce_create(ctx: Ctx, args: list[str]) -> str:
    severity = "INFO"
    if args and args[0].upper() in {"INFO", "WARNING", "CRITICAL"}:
        severity, args = args[0].upper(), args[1:]
    text = " ".join(args)
    title, _, body = text.partition("|")
    title, body = title.strip(), (body.strip() or title.strip())
    if not title:
        raise UsageError("Give a title, then `|`, then the body.")
    res = await ctx.api.post(
        "/admin/announcements", {"title": title, "body": body, "severity": severity}
    )
    return f":mega: Announcement `{res.get('id')}` is live ({severity})."


@command("announce end", "<id>", "Take an announcement down", min_args=1)
async def announce_end(ctx: Ctx, args: list[str]) -> str:
    aid = _uuid(args[0])
    await ctx.api.patch(f"/admin/announcements/{aid}", {"active": False})
    return f":white_check_mark: Announcement {aid} ended."


# ── support tickets ───────────────────────────────────────────────────────

TICKET_KEYS = ["id", "subject", "status", "severity", "sla_due_at"]


@command("tickets list", "[active|overdue|mine|resolved]", "Support queue")
async def tickets_list(ctx: Ctx, args: list[str]) -> str:
    view = (args[0] if args else "active").lower()
    params: dict[str, Any] = {"limit": 25}
    if view == "overdue":
        params["overdue"] = "true"
    elif view == "mine":
        params["assignee"] = "me"
    elif view == "resolved":
        params["status"] = "RESOLVED"
    else:
        params["status"] = "active"
    return rows(
        await ctx.api.get("/admin/support/tickets", **params), TICKET_KEYS, f"Tickets ({view})"
    )


@command("tickets view", "<id>", "A ticket and its thread", min_args=1)
async def tickets_view(ctx: Ctx, args: list[str]) -> str:
    t = await ctx.api.get(f"/admin/support/tickets/{_uuid(args[0], 'ticket id')}")
    out = obj(t, "Ticket", TICKET_KEYS + ["requester_email", "assignee_id", "version"])
    for m in (t.get("messages") or [])[-5:]:
        tag = " (internal)" if m.get("internal") else ""
        out += f"\n> {_val(m.get('body'))[:300]}{tag}"
    return out


async def _reply(ctx: Ctx, args: list[str], internal: bool) -> str:
    tid = _uuid(args[0], "ticket id")
    body = " ".join(args[1:]).strip()
    if not body:
        raise UsageError("Write the reply after the ticket id.")
    await ctx.api.post(
        f"/admin/support/tickets/{tid}/messages", {"body": body, "internal": internal}
    )
    return f":speech_balloon: {'Note added to' if internal else 'Replied on'} ticket {tid}."


@command("tickets reply", "<id> <message>", "Reply to the requester", min_args=2)
async def tickets_reply(ctx: Ctx, args: list[str]) -> str:
    return await _reply(ctx, args, False)


@command("tickets note", "<id> <message>", "Internal note", min_args=2)
async def tickets_note(ctx: Ctx, args: list[str]) -> str:
    return await _reply(ctx, args, True)


@command(
    "tickets status",
    "<id> <OPEN|IN_PROGRESS|WAITING_ON_USER|RESOLVED|CLOSED> [reason]",
    "Move a ticket",
    min_args=2,
)
async def tickets_status(ctx: Ctx, args: list[str]) -> str:
    tid = _uuid(args[0], "ticket id")
    current = await ctx.api.get(f"/admin/support/tickets/{tid}")
    body = {
        "expected_version": current.get("version"),
        "status": args[1].upper(),
        "reason": reason(args, 2),
    }
    res = await ctx.api.patch(f"/admin/support/tickets/{tid}", body)
    return f":white_check_mark: Ticket {tid} is {res.get('status')}."


# ── incidents ─────────────────────────────────────────────────────────────


@command("incidents list", "[status]", "Incidents")
async def incidents_list(ctx: Ctx, args: list[str]) -> str:
    data = await ctx.api.get("/admin/incidents", status=args[0].upper() if args else None, limit=20)
    return rows(data, ["id", "severity", "status", "service", "title"], "Incidents")


@command(
    "incidents open", "<SEV1-4> <service> <title> [| description]", "Open an incident", min_args=3
)
async def incidents_open(ctx: Ctx, args: list[str]) -> str:
    title, _, desc = " ".join(args[2:]).partition("|")
    body = {
        "severity": args[0].upper(),
        "service": args[1],
        "title": title.strip(),
        "description": desc.strip() or title.strip(),
        "reason": "Opened from Slack /rap",
    }
    res = await ctx.api.post("/admin/incidents", body)
    return f":rotating_light: Incident `{res.get('id')}` opened ({res.get('severity')})."


@command(
    "incidents status",
    "<id> <ACKNOWLEDGED|INVESTIGATING|MONITORING|RESOLVED> [reason]",
    "Move an incident",
    min_args=2,
)
async def incidents_status(ctx: Ctx, args: list[str]) -> str:
    iid = _uuid(args[0], "incident id")
    current = await ctx.api.get(f"/admin/incidents/{iid}")
    body = {"version": current.get("version"), "status": args[1].upper(), "reason": reason(args, 2)}
    res = await ctx.api.patch(f"/admin/incidents/{iid}", body)
    return f":white_check_mark: Incident {iid} is {res.get('status')}."


# ── platform: SEO, backups, usage, audit ──────────────────────────────────


@command("seo", "", "Indexing status and sitemap counts", aliases=("seo status",))
async def seo(ctx: Ctx, args: list[str]) -> str:
    pair: tuple[Any, ...] = await asyncio.gather(
        ctx.api.get("/admin/search-status"),
        ctx.api.get("/public/sitemap-counts"),
        return_exceptions=True,
    )
    status_, counts = pair
    out = (
        obj(status_, "Search indexing")
        if not isinstance(status_, BaseException)
        else "*Search indexing*: unavailable"
    )
    if isinstance(counts, dict):
        out += "\n" + obj(counts, "Sitemap entries")
    return out


@command("backups", "", "Last backup and restore check", aliases=("backups status",))
async def backups(ctx: Ctx, args: list[str]) -> str:
    data = await ctx.api.get("/admin/backups")
    summary = data.get("summary", data) if isinstance(data, dict) else data
    return obj(summary, "Backups")


@command("usage", "", "Free-tier usage and limits")
async def usage(ctx: Ctx, args: list[str]) -> str:
    return obj(await ctx.api.get("/admin/usage"), "Usage & limits")


@command("ai usage", "", "AI usage and allowances", aliases=("ai",))
async def ai_usage(ctx: Ctx, args: list[str]) -> str:
    return obj(await ctx.api.get("/admin/ai-usage"), "AI usage")


@command("ai actions", "", "Recent assistant actions", aliases=("assistant",))
async def ai_actions(ctx: Ctx, args: list[str]) -> str:
    data = await ctx.api.get("/admin/assistant-actions", limit=20)
    return rows(
        data, ["user_email", "tool", "status", "summary", "created_at"], "Assistant actions"
    )


@command("catalogue", "", "Service catalogue")
async def catalogue(ctx: Ctx, args: list[str]) -> str:
    return obj(await ctx.api.get("/admin/catalogue"), "Service catalogue")


@command("inventory", "", "Operations inventory")
async def inventory(ctx: Ctx, args: list[str]) -> str:
    return obj(await ctx.api.get("/admin/operations/inventory"), "Operations inventory")


@command("integrations", "", "Integration settings (feature flags view)")
async def integrations(ctx: Ctx, args: list[str]) -> str:
    return obj((await ctx.api.get("/admin/feature-flags")).get("flags", {}), "Integrations")


@command("audit", "[action prefix]", "Audit log", aliases=("audit log",))
async def audit(ctx: Ctx, args: list[str]) -> str:
    data = await ctx.api.get(
        "/admin/audit-events", limit=20, action_prefix=args[0] if args else None
    )
    return rows(
        data, ["created_at", "action", "resource_type", "resource_id", "actor_id"], "Audit log"
    )


@command("security", "", "Security events (privileged changes)")
async def security(ctx: Ctx, args: list[str]) -> str:
    data = await ctx.api.get("/admin/audit-events", limit=20, action_prefix="admin.")
    return rows(data, ["created_at", "action", "resource_id", "actor_id"], "Security events")


# ── help ──────────────────────────────────────────────────────────────────


def help_text(topic: str = "") -> str:
    seen: dict[str, Command] = {}
    for cmd in REGISTRY.values():
        seen.setdefault(cmd.name, cmd)
    topic = topic.lower().strip()
    lines = ["*`/rap` — the staff console from Slack*"]
    if not topic:
        lines += [
            "`/rap link <code>` link your Slack to your staff account (code from the console: "
            "Platform › Integrations › Slack)",
            "`/rap whoami` · `/rap unlink` · `/rap help <module>`",
            ":lock: = asks for confirmation first",
        ]
    if not topic:
        modules: dict[str, list[str]] = {}
        for name, cmd in sorted(seen.items()):
            head, _, sub = name.partition(" ")
            modules.setdefault(head, []).append((sub or "·") + (" :lock:" if cmd.confirm else ""))
        for head, subs in modules.items():
            lines.append(f"`/rap {head}` " + " · ".join(subs))
        return "\n".join(lines)
    for name, cmd in sorted(seen.items()):
        if not name.startswith(topic):
            continue
        lock = " :lock:" if cmd.confirm else ""
        lines.append(f"`/rap {name}{(' ' + cmd.usage) if cmd.usage else ''}` — {cmd.help}{lock}")
    return "\n".join(lines)
