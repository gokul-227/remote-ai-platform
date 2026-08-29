#!/usr/bin/env python3
"""
Live Black-Box Smoke Test Suite — Remote AI Platform Production
===============================================================
Tests the actual production endpoints on:
  - https://remote-ai-platform-api.onrender.com (API)
  - https://remote-ai-platform.vercel.app (Frontend)

Run:
  python3 docs/scripts/blackbox_smoke_test.py

Exit code 0 = all critical checks pass. Non-zero = P0 failures detected.
"""

from __future__ import annotations

import json
import sys
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

API_BASE = "https://remote-ai-platform-api.onrender.com"
WEB_BASE = "https://remote-ai-platform.vercel.app"

TIMEOUT = 30  # seconds per request


@dataclass
class CheckResult:
    name: str
    passed: bool
    status_code: int | None = None
    response_data: Any = None
    error: str | None = None
    latency_ms: float = 0.0
    priority: str = "P0"  # P0=critical, P1=important, P2=nice-to-have


results: list[CheckResult] = []


def check(name: str, *, priority: str = "P0") -> "CheckContext":
    return CheckContext(name, priority)


class CheckContext:
    def __init__(self, name: str, priority: str):
        self.name = name
        self.priority = priority
        self._result: CheckResult | None = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._result:
            results.append(self._result)
        return False  # don't suppress exceptions

    def ok(self, status_code: int, data: Any = None, latency_ms: float = 0.0):
        self._result = CheckResult(self.name, True, status_code, data, None, latency_ms, self.priority)
        print(f"  ✅ [{self.priority}] {self.name} — {status_code} ({latency_ms:.0f}ms)")

    def fail(self, error: str, status_code: int | None = None, latency_ms: float = 0.0):
        self._result = CheckResult(self.name, False, status_code, None, error, latency_ms, self.priority)
        print(f"  ❌ [{self.priority}] {self.name} — {error}")


def get(client: httpx.Client, path: str, *, base: str = API_BASE, headers: dict | None = None) -> tuple[int, Any, float]:
    url = f"{base}{path}"
    start = time.perf_counter()
    try:
        r = client.get(url, headers=headers or {}, timeout=TIMEOUT, follow_redirects=True)
        latency = (time.perf_counter() - start) * 1000
        try:
            data = r.json()
        except Exception:
            data = r.text[:500]
        return r.status_code, data, latency
    except Exception as e:
        latency = (time.perf_counter() - start) * 1000
        return -1, str(e), latency


def post(client: httpx.Client, path: str, body: dict, *, base: str = API_BASE, headers: dict | None = None) -> tuple[int, Any, float]:
    url = f"{base}{path}"
    start = time.perf_counter()
    try:
        r = client.post(url, json=body, headers=headers or {}, timeout=TIMEOUT, follow_redirects=True)
        latency = (time.perf_counter() - start) * 1000
        try:
            data = r.json()
        except Exception:
            data = r.text[:500]
        return r.status_code, data, latency
    except Exception as e:
        latency = (time.perf_counter() - start) * 1000
        return -1, str(e), latency


def main() -> int:
    print("=" * 70)
    print("Remote AI Platform — Live Black-Box Smoke Test")
    print(f"API:  {API_BASE}")
    print(f"Web:  {WEB_BASE}")
    print("=" * 70)

    with httpx.Client(verify=True) as client:

        # ── 1. Health Probes ────────────────────────────────────────────────────
        print("\n[1] Health Probes")

        with check("GET /health/version — version endpoint exists") as c:
            code, data, lat = get(client, "/health/version")
            if code == 200 and isinstance(data, dict) and "git_sha" in data:
                c.ok(code, data, lat)
                print(f"       git_sha={data.get('git_sha', '?')}, env={data.get('environment', '?')}")
            elif code == 404:
                c.fail("404 — new commit not yet deployed on Render", code, lat)
            else:
                c.fail(f"Unexpected: {code} — {str(data)[:200]}", code, lat)

        with check("GET /health/live — liveness probe") as c:
            code, data, lat = get(client, "/health/live")
            if code == 200:
                c.ok(code, data, lat)
            else:
                c.fail(f"Unexpected: {code}", code, lat)

        with check("GET /health/ready — readiness probe") as c:
            code, data, lat = get(client, "/health/ready")
            if code == 200 and isinstance(data, dict) and data.get("status") in ("HEALTHY", "DEGRADED"):
                c.ok(code, data, lat)
                svc = data.get("services", {})
                for svc_name, svc_data in svc.items():
                    if isinstance(svc_data, dict):
                        print(f"       {svc_name}: {svc_data.get('status', '?')}")
            elif code == 503:
                c.fail("503 — DB appears DOWN", code, lat)
            else:
                c.fail(f"Unexpected: {code} — {str(data)[:200]}", code, lat)

        with check("GET /api/v1/health/version — prefixed version endpoint", priority="P1") as c:
            code, data, lat = get(client, "/api/v1/health/version")
            if code == 200 and isinstance(data, dict) and "git_sha" in data:
                c.ok(code, data, lat)
            elif code == 404:
                c.fail("404 — route not yet live", code, lat)
            else:
                c.fail(f"Unexpected: {code}", code, lat)

        # ── 2. API Docs ─────────────────────────────────────────────────────────
        print("\n[2] API Surface")

        with check("GET /docs — OpenAPI docs reachable", priority="P1") as c:
            code, data, lat = get(client, "/docs")
            if code == 200:
                c.ok(code, None, lat)
            else:
                c.fail(f"Unexpected: {code}", code, lat)

        with check("GET /openapi.json — schema parseable", priority="P1") as c:
            code, data, lat = get(client, "/openapi.json")
            if code == 200 and isinstance(data, dict) and "paths" in data:
                c.ok(code, None, lat)
                print(f"       {len(data['paths'])} routes documented")
            else:
                c.fail(f"Unexpected: {code}", code, lat)

        # ── 3. Auth Endpoints ───────────────────────────────────────────────────
        print("\n[3] Auth Endpoints")

        with check("POST /api/v1/auth/register — schema validation (400 expected on empty)", priority="P1") as c:
            code, data, lat = post(client, "/api/v1/auth/register", {})
            if code in (400, 422):
                c.ok(code, None, lat)
                print("       Correctly rejected empty registration body")
            elif code == 201:
                c.fail("Registered with empty body — validation bug!", code, lat)
            else:
                c.fail(f"Unexpected: {code} — {str(data)[:200]}", code, lat)

        with check("POST /api/v1/auth/token — schema validation (422 expected on empty)", priority="P1") as c:
            code, data, lat = post(client, "/api/v1/auth/token", {})
            if code in (400, 422):
                c.ok(code, None, lat)
            else:
                c.fail(f"Unexpected: {code} — {str(data)[:200]}", code, lat)

        # ── 4. Security: Unauthenticated access must be denied ──────────────────
        print("\n[4] Security — Unauthenticated Rejection")

        protected_paths = [
            ("/api/v1/auth/me", "Auth.me"),
            ("/api/v1/engineers/me", "Engineers.me"),
            ("/api/v1/applications/me", "Applications.me"),
            ("/api/v1/admin/dashboard", "Admin.dashboard"),
        ]
        for path, label in protected_paths:
            with check(f"GET {path} — rejects unauthenticated") as c:
                code, data, lat = get(client, path)
                if code in (401, 403):
                    c.ok(code, None, lat)
                elif code == 404:
                    c.fail("404 — route may not be registered", code, lat)
                else:
                    c.fail(f"SECURITY RISK: {code} — returned data without auth!", code, lat)

        # ── 5. Cross-Tenant Security: Random UUID probing ───────────────────────
        print("\n[5] Security — Cross-Tenant UUID Probing (must 401/403/404)")

        probe_paths = [
            "/api/v1/engineers/00000000-0000-0000-0000-000000000001",
            "/api/v1/companies/00000000-0000-0000-0000-000000000001",
            "/api/v1/jobs/00000000-0000-0000-0000-000000000001",
            "/api/v1/projects/00000000-0000-0000-0000-000000000001",
            "/api/v1/contracts/00000000-0000-0000-0000-000000000001",
        ]
        for path in probe_paths:
            resource = path.split("/")[3]
            with check(f"Unauthenticated UUID probe: /{resource}/:uuid") as c:
                code, data, lat = get(client, path)
                if code in (401, 403, 404):
                    c.ok(code, None, lat)
                elif code == 200:
                    c.fail("CRITICAL: 200 on UUID probe without auth!", code, lat)
                else:
                    c.fail(f"Unexpected: {code}", code, lat)

        # ── 6. Frontend ─────────────────────────────────────────────────────────
        print("\n[6] Frontend (Vercel)")

        with check("GET / — homepage renders", priority="P1") as c:
            code, data, lat = get(client, "/", base=WEB_BASE)
            if code == 200:
                c.ok(code, None, lat)
            else:
                c.fail(f"Unexpected: {code}", code, lat)

        with check("GET /health/version — frontend version endpoint", priority="P2") as c:
            code, data, lat = get(client, "/health/version", base=WEB_BASE)
            if code == 200 and isinstance(data, dict):
                c.ok(code, data, lat)
            elif code == 404:
                c.fail("404 — not yet deployed", code, lat)
            else:
                c.fail(f"Unexpected: {code}", code, lat)

    # ── Summary ─────────────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("RESULTS SUMMARY")
    print("=" * 70)

    p0_fail = [r for r in results if not r.passed and r.priority == "P0"]
    p1_fail = [r for r in results if not r.passed and r.priority == "P1"]
    p2_fail = [r for r in results if not r.passed and r.priority == "P2"]
    passed = [r for r in results if r.passed]

    print(f"  ✅ Passed: {len(passed)}/{len(results)}")
    print(f"  ❌ P0 Failures: {len(p0_fail)}")
    print(f"  ⚠️  P1 Failures: {len(p1_fail)}")
    print(f"  ℹ️  P2 Failures: {len(p2_fail)}")

    if p0_fail:
        print("\n── P0 Critical Failures ─────────────────────────────────────────────")
        for r in p0_fail:
            print(f"  ❌ {r.name}")
            print(f"     Error: {r.error}")

    if p1_fail:
        print("\n── P1 Important Failures ────────────────────────────────────────────")
        for r in p1_fail:
            print(f"  ⚠️  {r.name}")
            print(f"     Error: {r.error}")

    # Output machine-readable JSON for CI
    output = {
        "total": len(results),
        "passed": len(passed),
        "p0_failures": len(p0_fail),
        "p1_failures": len(p1_fail),
        "p2_failures": len(p2_fail),
        "checks": [
            {
                "name": r.name,
                "priority": r.priority,
                "passed": r.passed,
                "status_code": r.status_code,
                "error": r.error,
                "latency_ms": round(r.latency_ms, 1),
            }
            for r in results
        ],
    }
    with open("docs/blackbox_smoke_results.json", "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n  Results written to docs/blackbox_smoke_results.json")
    print("=" * 70)

    return 1 if p0_fail else 0


if __name__ == "__main__":
    sys.exit(main())
