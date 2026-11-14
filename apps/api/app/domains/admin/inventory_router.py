"""Read-only operational catalogue derived from the running API's mounted routes.

Route availability is not provider health. Backup and restore status comes from
the runs that ops/backup scripts report to /ops/backups/report (see backup_router).
"""

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.domains.admin.backup_router import backup_summary
from app.domains.auth.dependencies import require_role
from app.domains.auth.models import User, UserRole

router = APIRouter(prefix="/admin/operations", tags=["Operations Inventory"])
staff = require_role(UserRole.ADMIN)

# These are existing read views, not external probes or commands to execute.
READ_VIEWS = (
    ("Background tasks", "/api/v1/admin/background/overview", "background"),
    ("Platform workload", "/api/v1/admin/operations/summary", "operations"),
    ("Usage", "/api/v1/admin/usage", "usage"),
    ("Incidents", "/api/v1/admin/incidents", "incidents"),
    ("Audit history", "/api/v1/admin/audit-events", "audit"),
)


@router.get("/inventory")
async def operations_inventory(
    request: Request, _admin: User = Depends(staff), db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    # FastAPI can represent included routers lazily; OpenAPI resolves them too.
    routes = {
        path: operations
        for path, operations in request.app.openapi()["paths"].items()
        if path.startswith("/api/v1/")
    }
    paths = {path for path, operations in routes.items() if "get" in operations}
    domains: dict[str, int] = {}
    for path in routes:
        domain = path.removeprefix("/api/v1/").split("/", 1)[0]
        domains[domain] = domains.get(domain, 0) + 1
    return {
        "measured_at": datetime.now(UTC),
        "basis": "mounted_api_routes",
        "health_assessed": False,
        "services": [
            {"id": domain, "route_count": count, "status": "mounted"}
            for domain, count in sorted(domains.items())
        ],
        "read_views": [
            {"name": name, "path": path, "screen": screen}
            for name, path, screen in READ_VIEWS
            if path in paths
        ],
        "backup": {
            **(await backup_summary(db)),
            "includes": ["Database public schema", "Object bytes and metadata"],
            "excludes": [
                "Auth users and sessions",
                "Database grants and roles",
                "Storage bucket policies",
                "Provider configuration",
            ],
            "required_evidence": [
                "Off-provider encrypted archive with checksum and manifest timestamp",
                "Restore into a separate empty target with row and object verification",
                "Review dangling file references and reapply erasures before production restore",
            ],
        },
    }
