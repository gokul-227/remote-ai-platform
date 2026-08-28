# WorkMesh AI — Enterprise Operations & SRE Runbook

This operational runbook provides production support procedures, diagnostic commands, and recovery workflows for the **Remote AI Platform (WorkMesh AI)** backend and frontend services.

---

## 1. Production Architecture Overview

```
                          +-----------------------------------+
                          |     Vercel Edge Network           |
                          |     (Next.js 14 Web Frontend)     |
                          +-----------------+-----------------+
                                            |
                                            | HTTPS / WSS
                                            v
                          +-----------------+-----------------+
                          |     Render Web Service            |
                          |     (FastAPI API Engine)          |
                          +--------+--------+--------+--------+
                                   |        |        |
             +---------------------+        |        +---------------------+
             |                              |                              |
             v                              v                              v
+------------+------------+   +-------------+------------+   +-------------+------------+
|  Supabase Postgres      |   |  Redis / Broker          |   |  Supabase Storage (S3)   |
|  (App Data + Migrations)|   |  (Rate Limits / Queues)  |   |  (Resumes & Assets)      |
+-------------------------+   +--------------------------+   +--------------------------+
```

---

## 2. Standard Diagnostic & Health Probes

The API exposes structured health check endpoints designed for load balancers and automated uptime monitors:

### A. Fast Liveness Probe (Event Loop Check)
- **Endpoint**: `GET https://<api-domain>/health/live`
- **Expected Status**: `200 OK`
- **Payload**: `{"status": "ALIVE", "version": "...", "environment": "production"}`
- **Use Case**: Container orchestration liveness checks.

### B. Deep Readiness Probe (Database & Broker Probe)
- **Endpoint**: `GET https://<api-domain>/health/ready`
- **Expected Status**: `200 OK` (or `503 Service Unavailable` if database is disconnected)
- **Payload**:
```json
{
  "status": "HEALTHY",
  "database": {"connected": true, "latency_ms": 12.4},
  "redis": {"connected": true, "latency_ms": 4.1}
}
```

### C. Dependencies Latency Diagnostic
- **Endpoint**: `GET https://<api-domain>/health/dependencies`
- **Expected Status**: `200 OK` / `503 Service Unavailable`
- **Inspects**: PostgreSQL, Redis Broker, S3 Storage (MinIO/Supabase), and configured AI Provider (Groq/OpenAI).

---

## 3. Rate Limiting & Throttling Policies

Rate limits are enforced at the application middleware level via Redis sliding-window token buckets with automatic in-process fallback:

| Tier | Route Path Pattern | Limit | Window | Action on Exceeded |
|---|---|---|---|---|
| **Auth Tier** | `/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/forgot-password`, `/api/v1/auth/reset-password` | **10 requests** | 60s | HTTP 429 + `Retry-After: 60` |
| **AI Tier** | `/api/v1/quality/*`, `/api/v1/matching/*` | **30 requests** | 60s | HTTP 429 + `Retry-After: 60` |
| **General Tier** | All other `/api/v1/*` endpoints | **120 requests** | 60s | HTTP 429 + `Retry-After: 60` |
| **Exempt** | `/health/*`, `/metrics`, `/docs`, `/openapi.json` | Unlimited | - | Never throttled |

---

## 4. Emergency Procedures & Incident Response

### Procedure 1: Compromised Account / Global Session Invalidation
When an account credential is leaked or an employee departs:
1. Trigger the session revocation endpoint:
   ```bash
   curl -X POST "https://<api-domain>/api/v1/auth/logout-all" \
     -H "Authorization: Bearer <USER_JWT>"
   ```
2. Alternatively, an administrator can increment `token_version` directly in the database:
   ```sql
   UPDATE users SET token_version = token_version + 1 WHERE email = 'target-user@example.com';
   ```
   *Result: All issued JWT access and refresh tokens for this user are invalidated immediately across all devices.*

### Procedure 2: Database Migration Rollback
If a newly deployed migration causes schema conflicts:
1. Check current revision:
   ```bash
   alembic current
   ```
2. Rollback the specific revision (e.g. to revision `025`):
   ```bash
   alembic downgrade 025_audit_events
   ```

### Procedure 3: Cold Start & Database Connection Pool Recovery
If the free-tier service encounters pool exhaustion after cold starts:
- Verify `DATABASE_URL` specifies `asyncpg` driver: `postgresql+asyncpg://...`
- Verify connection pool recycling is configured with `pool_recycle=300` and `pool_pre_ping=True` (configured in [`app/core/database.py`](file:///Users/gokulr/Developer/Remote_Work_Platform/apps/api/app/core/database.py)).

---

## 5. Centralized Audit Trail Inspection

Audit logs are stored in the append-only `audit_events` table with automatic PII sanitization.

### Querying Recent Sensitive Events via API:
```bash
curl -X GET "https://<api-domain>/api/v1/admin/audit-events?action=USER_LOGIN&limit=25" \
  -H "Authorization: Bearer <ADMIN_JWT>"
```

### Direct SQL Inspection:
```sql
SELECT action, actor_role, resource_type, resource_id, created_at, ip_address 
FROM audit_events 
ORDER BY created_at DESC 
LIMIT 50;
```
