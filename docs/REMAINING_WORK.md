# WorkMesh AI — Remaining Work (Proven by Forensic Audit)

> Evidence-based only. Nothing listed here is speculative; each item is backed by evidence from the audit at commit `da4534e98b282ab9f734d1daf60b2f040ee59513` (2026-08-08).

## P0 — Must fix before anything can run

| ID | Item | Evidence | Fix scope |
|---|---|---|---|
| B1 | `app/domains/groups/router.py:16` imports `get_current_user` from `app.core.security` (wrong module) | API crash traceback; pytest collection failure | 1-line import fix (function lives in `app.domains.auth.dependencies`) |
| B2 | Live DB is 13 migrations behind repo head (`009_project_management` vs `022_groups`); 18 tables missing | `alembic heads` vs `alembic current`; `\dt` shows 25 tables | Apply migrations 010–022 (Phase B action) |

After B1+B2, the remaining items below become verifiable.

## P1 — Quality gates

| ID | Item | Evidence |
|---|---|---|
| B3 | Frontend lint fails — 3 errors (`react/no-unescaped-entities` in `apps/web/src/app/auth/register/page.tsx`), 51 warnings (`@typescript-eslint/no-unused-vars`) | `npm run lint` → exit 1, "54 problems" |
| B4 | No `type-check` script in `apps/web/package.json` | `grep type-check package.json` → absent |
| — | Celery warning: `broker_connection_retry_on_startup` should be set for Celery 6.0+ | `docker compose logs celery-worker` |

## Runtime verification still needed (all blocked by B1/B2 — not yet proven)

- Register/login/logout/refresh E2E
- Engineer profile + skills + resume upload/parse + AI extraction
- Company profile + verification + dashboard
- Jobs CRUD, publish/unpublish, aggregation sync (5 adapters), dedup, search, saved jobs
- Applications lifecycle
- AI matching (requires AI provider available), recommendations UI
- Connections + messaging REST + WebSocket send/receive/persistence/reconnect
- Projects: brief, AI plan, tasks, dependencies, offers, submissions, revisions, approval
- Contracts: create/milestones/sign/terminate
- Trust/reviews/verifications
- Payments sandbox escrow flows (release/refund)
- Quality engine (requires AI provider)
- Admin: dashboard/stats/users/suspend/activate/moderation/AI usage/health
- Notifications: create/persist/unread/read-all/event coverage
- Groups + Social (require B2 tables)

## AI provider readiness

- Compose defaults to `ollama/qwen2.5 @ host.docker.internal:11434` but **no Ollama container is shipped** in compose.
- `.env` or runtime must provide working `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`, and/or a reachable Ollama endpoint.
- Until then, AI features remain IMPLEMENTED_NOT_RUNTIME_VERIFIED.

## Security hardening (production)

- Replace dev defaults in compose/env: `JWT_SECRET_KEY=dev_secret_key_change_in_prod`, `KEYCLOAK_CLIENT_SECRET=change-me-in-production`, `MINIO_SECRET_KEY`, `KEYCLOAK_ADMIN_PASSWORD=admin_dev_password`, `POSTGRES_PASSWORD`.
- Decide Keycloak integration: API currently uses local JWT; Keycloak is healthy but **not wired** into auth.
- Confirm `DEBUG=True` dev-mock-user behavior is disabled in production.

## Infrastructure gaps

- `web` service has **no healthcheck** (compose).
- `infra/monitoring` (Prometheus/Loki) and `infra/traefik` configs exist but **are not containers** in compose — not runnable as documented.
- No CDN/traefik routing wired for web/api.

## Documentation debt

- `CURRENT_STATE.md`, `IMPLEMENTATION_STATUS.md`, `FINAL_ENGINEERING_REPORT.md`, `HANDOFF.md`, previous `FORENSIC_AUDIT.md` (cites `bc4fe10`) contain claims contradicted by this audit — must be updated to match evidence at `da4534e`.