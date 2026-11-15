"""Copy Supabase Auth users into WorkOS User Management (sign-in migration).

    python -m app.ops.migrate_users_to_workos                  # dry run (default)
    python -m app.ops.migrate_users_to_workos --check-workos   # dry run + read-only WorkOS lookups
    python -m app.ops.migrate_users_to_workos --apply          # create users (WorkOS test env only)
    python -m app.ops.migrate_users_to_workos --apply --allow-production   # cut-over only

Source: the Supabase Auth Admin API (GET /auth/v1/admin/users, read-only) with
SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, or a JSON export via --source-file
(a list of Supabase user objects; used for synthetic test accounts).
Target: WorkOS Users API with WORKOS_API_KEY. Keys come from the environment
only and are never printed.

What is copied: email, whether Supabase confirmed it (-> email_verified), and
the Supabase id as WorkOS `external_id`. There are no passwords (members sign
in with email codes or OAuth); OAuth links are re-made by WorkOS on the first
Google/GitHub/Microsoft sign-in with the same verified email. The app links
the WorkOS user to the existing account by that verified email
(auth/service.py, user_identities); users.auth_subject is never touched.

Safe to re-run: a WorkOS user that already has the email is skipped, and a
state file (--state, default ./workos-migration-state.json) records each
Supabase id already handled so an interrupted run resumes where it stopped.
The report has counts only, never email addresses.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from collections import Counter
from collections.abc import AsyncIterator, Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

SUPABASE_PAGE_SIZE = 500
WORKOS_API_URL = "https://api.workos.com"


class MigrationRefusedError(Exception):
    """A safety rule stopped the run before anything was written."""


@dataclass
class Report:
    counts: Counter[str] = field(default_factory=Counter)
    providers: Counter[str] = field(default_factory=Counter)

    def as_dict(self) -> dict[str, Any]:
        return {
            "counts": dict(sorted(self.counts.items())),
            "providers": dict(sorted(self.providers.items())),
        }


@dataclass
class Candidate:
    supabase_id: str
    email: str | None
    email_confirmed: bool
    providers: list[str]
    created_at: str | None
    deleted: bool


def to_candidate(raw: dict[str, Any]) -> Candidate:
    providers = set((raw.get("app_metadata") or {}).get("providers") or [])
    providers |= {i.get("provider") for i in raw.get("identities") or [] if i.get("provider")}
    email = (raw.get("email") or "").strip().lower() or None
    return Candidate(
        supabase_id=str(raw["id"]),
        email=email,
        email_confirmed=bool(raw.get("email_confirmed_at") or raw.get("confirmed_at")),
        providers=sorted(p for p in providers if p),
        created_at=raw.get("created_at"),
        deleted=bool(raw.get("deleted_at")),
    )


# ── Source: Supabase Auth Admin API (GET only) ────────────────────────────────


async def supabase_users(
    client: httpx.AsyncClient, base_url: str, service_key: str
) -> AsyncIterator[dict[str, Any]]:
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    page = 1
    while True:
        resp = await client.get(
            f"{base_url.rstrip('/')}/auth/v1/admin/users",
            params={"page": page, "per_page": SUPABASE_PAGE_SIZE},
            headers=headers,
        )
        resp.raise_for_status()
        users = resp.json().get("users") or []
        for user in users:
            yield user
        if len(users) < SUPABASE_PAGE_SIZE:
            return
        page += 1


async def file_users(path: Path) -> AsyncIterator[dict[str, Any]]:
    data = json.loads(path.read_text())
    for user in data.get("users", data) if isinstance(data, dict) else data:
        yield user


# ── Target: WorkOS Users API ──────────────────────────────────────────────────


class WorkOS:
    def __init__(self, client: httpx.AsyncClient, api_key: str, base_url: str = WORKOS_API_URL):
        self.client = client
        self.base = base_url.rstrip("/")
        self.headers = {"Authorization": f"Bearer {api_key}"}

    async def find_by_email(self, email: str) -> str | None:
        resp = await self.client.get(
            f"{self.base}/user_management/users", params={"email": email}, headers=self.headers
        )
        resp.raise_for_status()
        data = resp.json().get("data") or []
        return str(data[0]["id"]) if data else None

    async def create(self, cand: Candidate) -> str:
        body: dict[str, Any] = {
            "email": cand.email,
            "email_verified": cand.email_confirmed,
            "external_id": cand.supabase_id,
        }
        resp = await self.client.post(
            f"{self.base}/user_management/users", json=body, headers=self.headers
        )
        if resp.status_code == 409 or (resp.status_code == 422 and "already" in resp.text.lower()):
            found = await self.find_by_email(cand.email or "")
            if found:
                return f"exists:{found}"
        resp.raise_for_status()
        return str(resp.json()["id"])


# ── State (resume) ────────────────────────────────────────────────────────────


def load_state(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text())
    return {str(k): str(v) for k, v in data.get("done", {}).items()}


def save_state(path: Path, done: dict[str, str]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    # Supabase id -> outcome (WorkOS id or reason). No email addresses.
    tmp.write_text(json.dumps({"done": done}, indent=0, sort_keys=True))
    tmp.replace(path)


# ── Run ──────────────────────────────────────────────────────────────────────


def check_target(api_key: str, apply: bool, allow_production: bool) -> str:
    if not api_key:
        raise MigrationRefusedError("WORKOS_API_KEY is not set")
    env = (
        "test"
        if api_key.startswith("sk_test_")
        else "live"
        if api_key.startswith("sk_live_")
        else "unknown"
    )
    if apply and env != "test" and not allow_production:
        raise MigrationRefusedError(
            "Refusing to write to a non-test WorkOS environment without --allow-production"
        )
    return env


async def migrate(
    users: AsyncIterator[dict[str, Any]] | Iterable[dict[str, Any]],
    *,
    workos: WorkOS | None,
    apply: bool,
    state_path: Path | None,
    limit: int | None = None,
) -> Report:
    report = Report()
    done = load_state(state_path) if state_path else {}
    handled = 0

    async def iterate() -> AsyncIterator[dict[str, Any]]:
        if hasattr(users, "__aiter__"):
            async for u in users:  # type: ignore[union-attr]
                yield u
        else:
            for u in users:  # type: ignore[union-attr]
                yield u

    async for raw in iterate():
        cand = to_candidate(raw)
        report.counts["supabase_users"] += 1
        for p in cand.providers or ["none"]:
            report.providers[p] += 1
        if cand.deleted:
            report.counts["skipped_deleted"] += 1
            continue
        if not cand.email:
            report.counts["skipped_no_email"] += 1
            continue
        report.counts["with_email"] += 1
        report.counts["email_confirmed" if cand.email_confirmed else "email_unconfirmed"] += 1
        if cand.supabase_id in done:
            report.counts["already_done_in_state"] += 1
            continue
        if limit is not None and handled >= limit:
            report.counts["not_reached_limit"] += 1
            continue
        handled += 1
        if workos is None:
            report.counts["would_import"] += 1
            continue
        try:
            existing = await workos.find_by_email(cand.email)
            if existing:
                report.counts["exists_in_workos"] += 1
                done[cand.supabase_id] = f"exists:{existing}"
            elif not apply:
                report.counts["would_create"] += 1
                continue
            else:
                outcome = await workos.create(cand)
                key = "exists_in_workos" if outcome.startswith("exists:") else "created"
                report.counts[key] += 1
                done[cand.supabase_id] = outcome
        except httpx.HTTPError as exc:
            status = getattr(getattr(exc, "response", None), "status_code", "network")
            report.counts[f"failed_{status}"] += 1
            report.counts["failed"] += 1
            continue
        if state_path and apply:
            save_state(state_path, done)
    return report


async def run(
    argv: list[str] | None = None, transport: httpx.AsyncBaseTransport | None = None
) -> dict[str, Any]:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0] if __doc__ else "")
    parser.add_argument(
        "--apply", action="store_true", help="create WorkOS users (default: dry run)"
    )
    parser.add_argument(
        "--check-workos", action="store_true", help="dry run with read-only WorkOS lookups"
    )
    parser.add_argument(
        "--allow-production", action="store_true", help="permit --apply on a live WorkOS key"
    )
    parser.add_argument(
        "--source-file", type=Path, help="JSON list of Supabase user objects instead of the API"
    )
    parser.add_argument("--state", type=Path, default=Path("workos-migration-state.json"))
    parser.add_argument("--limit", type=int, default=None, help="handle at most N users this run")
    args = parser.parse_args(argv)

    workos_key = os.environ.get("WORKOS_API_KEY", "")
    use_workos = args.apply or args.check_workos
    target_env = (
        check_target(workos_key, args.apply, args.allow_production) if use_workos else "none"
    )

    async with httpx.AsyncClient(timeout=30, transport=transport) as client:
        if args.source_file:
            source = file_users(args.source_file)
            source_name = "file"
        else:
            base = os.environ.get("SUPABASE_URL", "")
            key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
            if not base or not key:
                raise MigrationRefusedError(
                    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
                )
            source = supabase_users(client, base, key)
            source_name = "supabase"
        workos = (
            WorkOS(client, workos_key, os.environ.get("WORKOS_API_URL", WORKOS_API_URL))
            if use_workos
            else None
        )
        report = await migrate(
            source, workos=workos, apply=args.apply, state_path=args.state, limit=args.limit
        )
    return {
        "mode": "apply" if args.apply else "dry-run",
        "source": source_name,
        "workos_environment": target_env,
        **report.as_dict(),
    }


def main() -> int:
    try:
        result = asyncio.run(run())
    except MigrationRefusedError as exc:
        print(f"refused: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2))
    return 1 if result["counts"].get("failed") else 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
