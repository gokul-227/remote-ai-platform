# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Remote AI Platform is an AI-powered remote engineering marketplace: it aggregates remote jobs from
external boards, extracts structured engineer profiles from resumes via LLMs, and computes explainable
engineer↔job matches. Three personas — engineer, company, admin — are served by one Next.js frontend and
one FastAPI backend.

Monorepo layout: npm workspaces (`apps/*`, `packages/*`) orchestrated by Turborepo.
- `apps/api` — FastAPI backend (Python 3.11, async SQLAlchemy 2, Celery, LiteLLM)
- `apps/web` — Next.js 16 / React 19 frontend (Tailwind v4, TanStack Query)
- `packages/config`, `packages/shared`, `packages/ui` — currently empty placeholders for future shared code
- `infra/docker/docker-compose.yml` — the single source of truth for local infra

**apps/web has its own `CLAUDE.md`/`AGENTS.md`** warning that this repo pins recent Next.js/React
versions with breaking API/convention changes — check `node_modules/next/dist/docs/` before writing
frontend code rather than relying on memorized conventions.

## Commands

```bash
# Local infra (Postgres, Redis, MinIO, Keycloak, Celery worker/beat)
cp .env.example .env
npm run docker:up      # docker compose -f infra/docker/docker-compose.yml up -d

# Backend (apps/api)
cd apps/api
python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload        # API on :8000
alembic upgrade head                  # apply migrations
pytest                                 # run tests
ruff check . && mypy app               # lint + type check
python -m app.scripts.seed_data        # seed demo users/jobs/profiles

# Frontend (apps/web)
cd apps/web
npm run dev            # :3000
npm run build
npm run lint

# Root (Turborepo, fans out to all workspaces)
npm run dev / build / lint / type-check / test
```

## Architecture, in one paragraph

`apps/api/app/domains/` holds one subpackage per bounded context, generally layered as
`models.py` / `schemas.py` / `repository.py` / `service.py` / `router.py`; all routers are registered in
`apps/api/app/main.py` under prefix `/api/v1`. AI calls go through LiteLLM only (`app/agents/*` →
`app/services/ai/service.py` → `app/agents/llm_client.py`) — never a provider SDK directly. Celery
(`app/workers/`) has 4 queues (`default`, `jobs`, `ai`, `matching`) and a beat schedule for job-source
sync, trending-skills refresh, and stale-match recompute. `apps/web/src/app/` is the Next.js App Router,
persona-first (`engineer/*`, `company/*`, `admin/dashboard`), styled via a hand-rolled Tailwind v4 system
in `globals.css` — not a component library.

## Documentation

In-depth docs (architecture, deployment, audits, UI screenshots) live in the companion private repo, not
here — ask the repo owner for access if you need them. Keep this file itself as the only
architecture-in-prose document in the public repo.
