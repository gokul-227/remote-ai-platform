# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Remote AI Platform is a remote-work marketplace for professionals and organisations: it aggregates
remote jobs from external boards, builds profiles (optionally AI-assisted from a resume), computes
explainable matches, and supports applications, invitations, messaging, groups, projects and contracts.
Personas — professional (role `ENGINEER` internally), organisation (`COMPANY`), admin — share one
frontend and one API. User-facing copy says "professional", never "engineer".

Monorepo layout: npm workspaces (`apps/*`, `tests/*`) orchestrated by Turborepo.
- `apps/api` — FastAPI backend (Python 3.11, async SQLAlchemy 2, Alembic, LiteLLM)
- `apps/web` — Next.js 16 / React 19 frontend; the product UI lives in `apps/web/src/figma`
- `tests/e2e` — Playwright journeys against an isolated stack + mock Supabase Auth
- `infra/docker/docker-compose.yml` — local infra (Postgres, Redis, MinIO, API, web)

**apps/web has its own `CLAUDE.md`/`AGENTS.md`** warning that this repo pins recent Next.js/React
versions with breaking API/convention changes — check `node_modules/next/dist/docs/` before writing
frontend code rather than relying on memorized conventions.

## Commands

```bash
# Backend (apps/api)
cd apps/api
python3.11 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn app.main:app --reload     # API on :8000
.venv/bin/alembic upgrade head              # apply migrations
.venv/bin/pytest                            # tests (SQLite, Supabase-style test tokens)
.venv/bin/ruff check . && .venv/bin/mypy app

# Frontend (apps/web)
cd apps/web
npm run dev / npm run build / npm run lint / npx tsc --noEmit / npm test

# E2E (see README): mock Supabase + docker-compose.e2e.yml, then
cd tests/e2e && npx playwright test

# Generated docs (never hand-edit docs/architecture, docs/api)
make docs-sync      # architecture diagram + OpenAPI
make docs-check     # CI's drift check
make postman-sync DRY_RUN=1   # OpenAPI -> Postman collection; CI pushes it to the Postman cloud from prod
```

## Architecture, in one paragraph

`apps/api/app/domains/` holds one subpackage per bounded context (`models.py` / `schemas.py` /
`router.py`, plus `repository.py` / `service.py` where they exist); all routers mount under `/api/v1` in
`apps/api/app/main.py`. **Supabase Auth is the only identity provider**: the API verifies Supabase access
tokens (JWKS) in `app/domains/auth/dependencies.py` and never issues tokens; role lives in the app's own
`users` table. AI calls go through LiteLLM only (`app/agents/*` → `app/services/ai/service.py` →
`app/agents/llm_client.py`), using the free-tier chain in `AI_FREE_TIER_CHAIN` with per-user token
allowances (`app/services/ai/metering.py`). There is no background worker: resume parsing is inline with a
time budget and job sync is `.github/workflows/scheduled-job-sync.yml`. Money movement is gated off
(`MARKETPLACE_PAYMENTS_ENABLED`); contract/milestone state rules live in `app/domains/contracts/lifecycle.py`.
The frontend is a hash-routed client app in `apps/web/src/figma` (routes in `App.tsx`, role-aware shell in
`rap_shell.tsx`), styled via its own CSS/Tailwind utilities — not a component library.

Conventions that tests enforce: AI calls reserve then settle quota (`services/ai/metering.py`); the data
export is an explicit list (`auth/export.py`, a test fails for unclassified user-linked tables); deleting an
account is refused while signed contracts/payments exist (`auth/retention.py`); links from users must be
http(s) (`HttpUrlIn`, `safeHref`); migration ids fit VARCHAR(32); product copy may not claim escrow, personal
picks or unverified numbers (`claims.test.ts`); CI fails below 80% backend coverage. Concurrency is tested on
PostgreSQL (`tests/test_postgres_concurrency.py`), not SQLite.

## Documentation

In-depth docs (architecture, deployment, audits, UI screenshots) live in the companion private repo, not
here — ask the repo owner for access if you need them. Keep this file itself as the only
architecture-in-prose document in the public repo.
