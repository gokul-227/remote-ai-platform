# Docker Verification — Forensic Round 2 (commit da4534e)

> Audit date: 2026-08-08 | Commit `da4534e98b282ab9f734d1daf60b2f040ee59513` (main, clean)

## 1. Environment
| Item | Value |
|---|---|
| Docker Engine | 29.6.2 |
| Docker Compose | v5.3.1 |
| Compose file | `infra/docker/docker-compose.yml` |
| Container name prefix | `remote-ai-platform-*` |

## 2. Commands Executed with Exit Codes
| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `docker compose -f infra/docker/docker-compose.yml config` | 0 | VALID (9 services) |
| 2 | `docker compose -f infra/docker/docker-compose.yml build` | 0 | PASS — api, web, celery-worker, celery-beat images built |
| 3 | `docker compose -f infra/docker/docker-compose.yml up -d --force-recreate` | 0 | All containers created |
| 4 | `docker compose -f infra/docker/docker-compose.yml ps` | 0 | See matrix below |

## 3. Container Matrix
| Component | Status | Detail |
|---|---|---|
| Docker infrastructure | **PASS** | daemon 29.6.2, compose v5.3.1, config valid, build/up succeeded |
| postgres | **PASS** | healthy (pg_isready) |
| redis | **PASS** | healthy (redis-cli ping) |
| minio | **PASS** | healthy, console 200 @ :9001 |
| minio-init | **PASS** | one-shot, buckets created |
| keycloak | **PASS** | healthy, 302 @ :8080 (expected), realm imported |
| api | **FAIL** | crash-looping — ImportError (see §5) |
| web | **PASS** | up, HTTP 200 @ :3000 (Next.js ready in 251ms) |
| celery-worker | **PASS** | `celery@… ready.` |
| celery-beat | **PASS** | `beat: Starting...` |

## 4. HTTP Reachability Matrix
| URL | Status | Meaning |
|---|---|---|
| http://localhost:3000 | **200** | web serves |
| http://localhost:8000 | **000** | API DOWN (connection refused) |
| http://localhost:8000/docs | **000** | API DOWN |
| http://localhost:8000/api/v1/health | **000** | API DOWN |
| http://localhost:8000/openapi.json | **000** | API DOWN |
| http://localhost:8080 | **302** | Keycloak redirect (expected) |
| http://localhost:9001 | **200** | MinIO console |

## 5. API Container Failure Analysis
Exact traceback from `docker compose logs api`:
```text
File "/app/app/main.py", line 40, in <module>
    from app.domains.groups.router import router as groups_router
File "/app/app/domains/groups/router.py", line 16, in <module>
    from app.core.security import get_current_user
ImportError: cannot import name 'get_current_user' from 'app.core.security' (/app/app/core/security.py)
```
- **Root cause:** wrong import target in `groups/router.py:16` — `get_current_user` lives in `app.domains.auth.dependencies`.
- **Severity:** P0 — blocks entire API.
- **NOT FIXED** per audit rules.

## 6. Database Migration State
| Source | Revision |
|---|---|
| `alembic heads` | `022_groups (head)` |
| `alembic current` (live) | `009_project_management` |

Live DB has 25 tables; 18 tables from migrations 010–022 **missing** (task_dependencies, task_assignment_offers, work_submissions, work_ledger_entries, payment_transactions, project_reviews, moderation_reports, ai_usage_logs, posts, post_likes, post_comments, contracts, contract_milestones, user_verifications, user_trust_scores, groups, group_memberships, group_posts).

## 7. Service Log Summaries
- **web:** Next.js 16.2.11 (Turbopack); `✓ Ready in 251ms`; `GET / 200`.
- **celery-worker:** ready; non-fatal warning re `broker_connection_retry_on_startup` (Celery 6.0+).
- **celery-beat:** starting with PersistentScheduler (`celerybeat-schedule`).
- **minio-init:** `Added local successfully`; buckets created; `MinIO buckets initialized`.
- **api:** uvicorn reloader started, then child process crashed on ImportError.

## 8. Bottom Line
**Docker infrastructure itself PASSES (config, build, up, postgres/redis/minio/keycloak/web/celery all run). The API application does NOT boot, so the documented "fully runnable locally" claim is FALSE at this commit.**