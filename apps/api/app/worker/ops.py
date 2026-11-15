"""
Owner-facing operational checks that post to Slack (app/services/slack.py).

    check_liveness        scheduler heartbeat loop: stale worker -> #alerts-critical
    daily_import_summary  07:00 UTC -> #job-imports
    check_backups         08:00 UTC: missed backup / unverified restore -> #backups (+ critical)
    cost_guard            every 6 h: free-tier usage at COST_WARN/CRITICAL_PERCENT -> #costs
    seo_weekly_report     Mondays 07:30 UTC: Search Console clicks, impressions, top
                          queries/pages and sitemap coverage -> #seo (else #signups)

Each returns a plain dict for the task run log and never raises on a failed probe.
"""

import asyncio
import shutil
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.services import slack

logger = get_logger(__name__)


def _now() -> datetime:
    return datetime.now(UTC)


async def check_liveness(db: AsyncSession) -> dict[str, Any]:
    from app.domains.tasks.service import TaskService

    liveness = await TaskService(db).liveness()
    stale = [k for k, v in liveness.items() if v["count"] and v["fresh"] == 0]
    for kind in stale:
        await slack.post(
            "critical",
            f":red_circle: No fresh {kind} heartbeat "
            f"(newest {liveness[kind]['newest_age_seconds']}s old, "
            f"stale after {settings.WORKER_HEARTBEAT_STALE_SECONDS}s)",
            dedup_key=f"heartbeat:{kind}",
        )
    return {"stale": stale}


async def daily_import_summary(db: AsyncSession) -> dict[str, Any]:
    from app.domains.tasks.models import JobImportCheckpoint, TaskRun
    from app.domains.tasks.service import TASK_IMPORT_SOURCE

    since = _now() - timedelta(days=1)
    rows = (
        await db.execute(
            select(TaskRun.status, func.count())
            .where(TaskRun.task_name == TASK_IMPORT_SOURCE, TaskRun.created_at >= since)
            .group_by(TaskRun.status)
        )
    ).all()
    counts = {str(s): int(n) for s, n in rows}
    results: Any = (
        await db.execute(
            select(TaskRun.result).where(
                TaskRun.task_name == TASK_IMPORT_SOURCE,
                TaskRun.created_at >= since,
                TaskRun.status == "SUCCEEDED",
            )
        )
    ).scalars()
    per_source: dict[str, int] = {}
    for r in results:
        name = str((r or {}).get("source") or "?")
        per_source[name] = per_source.get(name, 0) + int((r or {}).get("saved", 0) or 0)
    saved = sum(per_source.values())
    failing = [
        f"{cp.source} ({cp.consecutive_failures}x: {(cp.last_error or '')[:80]})"
        for cp in (await db.execute(select(JobImportCheckpoint))).scalars()
        if cp.consecutive_failures > 0
    ]
    summary = ", ".join(f"{k.lower()} {v}" for k, v in sorted(counts.items())) or "no runs"
    await slack.post(
        "job_imports",
        f":bar_chart: Job imports, last 24 h: {summary}; {saved} jobs saved",
        dedup_key=f"import-summary:{_now():%Y%m%d}",
        fields={
            "failing sources": "; ".join(failing) if failing else "none",
            # Every source that ran, new ones included, busiest first.
            "by source": ", ".join(
                f"{k} {v}" for k, v in sorted(per_source.items(), key=lambda kv: (-kv[1], kv[0]))
            )
            or "none",
        },
    )
    return {"counts": counts, "saved": saved, "failing": len(failing), "by_source": per_source}


async def check_backups(db: AsyncSession) -> dict[str, Any]:
    from app.domains.admin.backup_router import backup_summary

    summary = await backup_summary(db)
    state = summary["status"]
    messages = {
        "no_evidence": ":x: No successful backup has ever been reported",
        "backup_stale": ":x: Backup missed: no successful backup in the last 26 h",
        "restore_unverified": ":warning: No verified restore in the last 35 days",
    }
    if state in messages:
        fields = {
            "environment": summary["environment"],
            "last backup": summary["last_backup_at"],
            "last restore check": summary["last_restore_verified_at"],
            "runbook": summary["runbook"],
        }
        day = f"{_now():%Y%m%d}"
        await slack.post(
            "backups", messages[state], dedup_key=f"backup:{state}:{day}", fields=fields
        )
        if state != "restore_unverified":
            await slack.post(
                "critical", messages[state], dedup_key=f"backup:{state}:{day}", fields=fields
            )
    return {"status": state}


# ── free-tier guard ─────────────────────────────────────────────────────────


def _bucket_bytes() -> dict[str, int]:
    import boto3

    if not (settings.OCI_S3_ACCESS_KEY_ID and settings.OCI_S3_SECRET_ACCESS_KEY):
        return {}
    s3 = boto3.client(
        "s3",
        endpoint_url=settings.OCI_S3_ENDPOINT,
        region_name=settings.OCI_S3_REGION,
        aws_access_key_id=settings.OCI_S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.OCI_S3_SECRET_ACCESS_KEY,
    )
    names = [b.strip() for b in settings.COST_BUCKETS.split(",") if b.strip()] or [
        b["Name"] for b in s3.list_buckets().get("Buckets", [])
    ]
    sizes: dict[str, int] = {}
    for name in names:
        total = 0
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=name):
            total += sum(int(o.get("Size", 0)) for o in page.get("Contents", []))
        sizes[name] = total
    return sizes


async def measure(db: AsyncSession) -> dict[str, dict[str, Any]]:
    """metric -> {used, limit, unit}. A probe that fails is left out (and logged)."""
    out: dict[str, dict[str, Any]] = {}
    start_day = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    start_month = start_day.replace(day=1)

    try:
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            size = await db.scalar(text("SELECT pg_database_size(current_database())"))
            out["database"] = {
                "used": round(int(size or 0) / 1_048_576, 1),
                "limit": settings.COST_DB_LIMIT_MB,
                "unit": "MB",
            }
    except Exception as exc:
        logger.warning("cost guard: database size failed", error=type(exc).__name__)

    try:
        buckets = await asyncio.to_thread(_bucket_bytes)
        if buckets:
            out["object_storage"] = {
                "used": round(sum(buckets.values()) / 1_073_741_824, 2),
                "limit": settings.COST_STORAGE_LIMIT_GB,
                "unit": "GB",
                "detail": {k: round(v / 1_048_576, 1) for k, v in buckets.items()},
            }
    except Exception as exc:
        logger.warning("cost guard: bucket sizes failed", error=type(exc).__name__)

    try:
        disk = shutil.disk_usage(settings.COST_DISK_PATH)
        out["vm_disk"] = {
            "used": round(disk.used / 1_073_741_824, 1),
            "limit": round(disk.total / 1_073_741_824, 1),
            "unit": "GB",
        }
    except Exception as exc:
        logger.warning("cost guard: disk usage failed", error=type(exc).__name__)

    try:
        from app.services.ai.models import AIUsageLog

        tokens = await db.scalar(
            select(func.coalesce(func.sum(AIUsageLog.total_tokens), 0)).where(
                AIUsageLog.created_at >= start_day
            )
        )
        out["ai_tokens_today"] = {
            "used": int(tokens or 0),
            "limit": settings.AI_GLOBAL_DAILY_TOKENS,
            "unit": "tokens",
        }
    except Exception as exc:
        logger.warning("cost guard: AI usage failed", error=type(exc).__name__)

    try:
        from app.domains.notifications.models import EmailOutbox

        async def sent_since(ts: datetime) -> int:
            return int(
                await db.scalar(
                    select(func.count())
                    .select_from(EmailOutbox)
                    .where(EmailOutbox.status == "SENT", EmailOutbox.sent_at >= ts)
                )
                or 0
            )

        out["email_today"] = {
            "used": await sent_since(start_day),
            "limit": settings.COST_EMAIL_DAILY_LIMIT,
            "unit": "emails",
        }
        out["email_month"] = {
            "used": await sent_since(start_month),
            "limit": settings.COST_EMAIL_MONTHLY_LIMIT,
            "unit": "emails",
        }
    except Exception as exc:
        logger.warning("cost guard: email count failed", error=type(exc).__name__)
    return out


async def cost_guard(db: AsyncSession) -> dict[str, Any]:
    metrics = await measure(db)
    alerts: list[str] = []
    for name, m in metrics.items():
        limit = float(m["limit"] or 0)
        if limit <= 0:
            continue
        pct = 100.0 * float(m["used"]) / limit
        m["percent"] = round(pct, 1)
        if pct >= settings.COST_CRITICAL_PERCENT:
            level, icon = "critical", ":rotating_light:"
        elif pct >= settings.COST_WARN_PERCENT:
            level, icon = "warning", ":warning:"
        else:
            continue
        alerts.append(name)
        await slack.post(
            "costs",
            f"{icon} {name.replace('_', ' ')} at {pct:.0f}% of the free limit "
            f"({m['used']} / {m['limit']} {m['unit']})",
            dedup_key=f"cost:{name}:{level}:{_now():%Y%m%d}",
            fields={"detail": m.get("detail")} if m.get("detail") else None,
        )
    return {"metrics": metrics, "alerts": alerts}


def _delta(now: float, before: float) -> str:
    if not before:
        return ""
    pct = (now - before) / before * 100
    return f" ({pct:+.0f}% vs previous 7 days)"


async def seo_weekly_report(db: AsyncSession | None = None) -> dict[str, Any]:
    """Weekly Search Console summary to Slack, behind SEO_WEEKLY_REPORT_ENABLED.
    Uses the Indexing API service account (it needs read access to the
    property; see docs/operations/seo.md). Never raises."""
    from app.services.search.indexing import search_console_report

    if not settings.SEO_WEEKLY_REPORT_ENABLED:
        return {"skipped": "disabled"}
    try:
        # Search Console data lags ~2-3 days: compare the latest full week with the one before.
        cur = await search_console_report(days=7, offset_days=3)
        prev = await search_console_report(days=7, offset_days=10)
    except Exception as exc:
        logger.warning("Search Console report failed", error=type(exc).__name__)
        await slack.post(
            "seo" if slack.channel_id("seo") else "signups",
            f":warning: Weekly Search Console report failed ({type(exc).__name__}). "
            "Check that the service account can read the property.",
            dedup_key=f"seo-weekly-failed:{_now():%Y%W}",
        )
        return {"error": type(exc).__name__}
    if not cur.get("configured"):
        return {"skipped": "no credentials"}
    sitemaps = cur.get("sitemaps", [])
    submitted = sum(m["submitted"] for m in sitemaps)
    indexed = sum(m["indexed"] for m in sitemaps)
    errors = sum(m["errors"] for m in sitemaps)

    def top(rows: list[dict[str, Any]], n: int = 5) -> str:
        return "; ".join(
            f"{r['key']} ({r['clicks']} clicks, {r['impressions']} impr., pos {r['position']})"
            for r in rows[:n]
        ) or "none yet"

    channel = "seo" if slack.channel_id("seo") else "signups"
    await slack.post(
        channel,
        ":mag: Search Console, last 7 days: "
        f"{cur['clicks']} clicks{_delta(cur['clicks'], prev.get('clicks', 0))}, "
        f"{cur['impressions']} impressions{_delta(cur['impressions'], prev.get('impressions', 0))}, "
        f"average position {cur['average_position']}",
        dedup_key=f"seo-weekly:{_now():%Y%W}",
        fields={
            "top queries": top(cur.get("top_queries", [])),
            "top pages": top(cur.get("top_pages", []), 3),
            # Search Console no longer reports per-sitemap indexed counts for most
            # properties; 0 indexed with many submitted is normal, see the Pages report.
            "sitemaps": f"{len(sitemaps)} read, {submitted} URLs submitted, "
            f"{indexed} reported indexed, {errors} errors",
        },
    )
    return {
        "clicks": cur["clicks"],
        "impressions": cur["impressions"],
        "submitted": submitted,
        "indexed": indexed,
    }
