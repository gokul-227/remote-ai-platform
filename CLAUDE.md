# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

"Remote AI Platform" (the repo's first commit message was "WorkMesh AI MVP" — an earlier project name,
since fully renamed) is an AI-powered remote engineering marketplace: it aggregates remote jobs from
external boards, extracts structured engineer profiles from resumes via LLMs, and computes explainable
engineer↔job matches. Three personas — engineer, company, admin — are served by one Next.js frontend and
one FastAPI backend.

Monorepo layout: npm workspaces (`apps/*`, `packages/*`) orchestrated by Turborepo.
- `apps/api` — FastAPI backend (Python 3.11, async SQLAlchemy 2, Celery, LiteLLM)
- `apps/web` — Next.js 16 / React 19 frontend (Tailwind v4, TanStack Query)
- `packages/config`, `packages/shared`, `packages/ui` — currently empty placeholders for future shared code
- `infra/docker/docker-compose.yml` — the single source of truth for local infra

**apps/web has its own `CLAUDE.md`/`AGENTS.md`** warning that this repo pins `next@16.2.11` and
`react@19.2.4` — versions newer than most training data, with breaking API/convention changes. Before
writing frontend code, check `node_modules/next/dist/docs/` for the current API rather than relying on
memorized Next.js/React conventions.

## Commands

All commands below assume repo root unless a `cd` is shown.

### Local infra (Postgres, Redis, MinIO, Keycloak, Celery worker/beat/Flower, monitoring stack)
```bash
cp .env.example .env
npm run docker:up      # docker compose -f infra/docker/docker-compose.yml up -d
npm run docker:logs
npm run docker:down
```

### Backend (apps/api)
```bash
cd apps/api
python3.11 -m venv .venv && source .venv/bin/activate   # do NOT reuse committed .venv/.venv_local — see caveat below
pip install -e ".[dev]"

uvicorn app.main:app --reload                             # run API directly (port 8000)
alembic upgrade head                                       # apply migrations (also: npm run db:migrate from root)
alembic revision --autogenerate -m "description"           # new migration; versions are numbered 001_, 002_, ...

pytest                                                      # run all tests
pytest tests/test_jobs.py                                   # single file
pytest tests/test_jobs.py::test_name -v                     # single test
ruff check .                                                # lint
mypy app                                                    # type check
```
There is no seed script at `scripts/seed_demo_jobs.py` or `apps/api/scripts/seed.py` despite references
in README/package.json — both are missing from the repo. Demo data seeding lives instead at
`apps/api/app/scripts/seed_data.py` (users, engineer/company profiles, jobs, projects, groups):
```bash
python -m app.scripts.seed_data      # from apps/api, with venv active
```
Alternatively, seed demo jobs only by calling the running API:
```bash
curl -X POST "http://localhost:8000/api/v1/jobs/seed_demo"
```

Celery (usually run via docker compose, but can be run directly):
```bash
celery -A app.workers.celery_app worker --concurrency=4 -Q default,jobs,ai,matching
celery -A app.workers.celery_app beat
celery -A app.workers.celery_app flower
```

**Python version caveat**: `pyproject.toml` requires `>=3.11` and the Dockerfile uses `python:3.11-slim`,
but the committed venvs don't match: `apps/api/.venv_local` is Python 3.14 and `apps/api/.venv` is Python
3.12 — neither is 3.11, and the 3.14 one fails to import `pydantic_core` (binary wheel mismatch). Prefer
running the backend/tests via `docker compose` or a freshly created 3.11 venv rather than the committed ones.

### Frontend (apps/web)
```bash
cd apps/web
npm run dev             # next dev, port 3000
npm run build            # next build (production images build with `--webpack` to avoid a Turbopack/Tailwind-v4-PostCSS conflict — see apps/web/Dockerfile)
npm run lint
```
There is no test framework installed in `apps/web` (no jest/vitest/playwright) and no `test` script,
even though the root `turbo.json` defines a `test` pipeline. `tests/e2e/` at repo root exists but is empty.

### Root/monorepo (Turborepo, fans out to all workspaces)
```bash
npm run dev
npm run build
npm run lint
npm run type-check
npm run test
```

## Architecture

### Backend: domain-driven modular monolith

`apps/api/app/domains/` holds one subpackage per bounded context (21 total). The mature domains (`auth`,
`engineers`, `companies`, `jobs`, `matching`, `admin`, `trust`) follow a consistent layered pattern:

```
domains/<name>/
  models.py       # SQLAlchemy models (Base from app.core.database)
  schemas.py      # Pydantic request/response schemas
  repository.py   # DB access class, e.g. JobRepository
  service.py       # business logic class, e.g. JobService — built on top of the repository
  router.py       # FastAPI APIRouter; endpoints get the service via a get_X_service dependency
```

Newer/thinner domains (`saved_jobs`, `applications`, `projects`, `notifications`, `network`, `search`,
`social`, `contracts`, `payments`, `groups`, `quality`) may only have `models.py` + `router.py` so far, or
vary in how much of the layering is filled in; `marketplace` has only `models.py` and isn't wired into
`main.py` at all. Check each domain's actual files rather than assuming full layering.

All domain routers are registered in `apps/api/app/main.py` under `create_app()`, mounted with a shared
`prefix = "/api/v1"`. When adding a new domain or endpoint, wire the router into `main.py` the same way
the existing 20 routers are.

`app/core/` holds cross-cutting concerns, not a domain itself:
- `config.py` — single `Settings(BaseSettings)`, cached via `get_settings()`, exported as `settings`
- `database.py` — async engine, `Base`, `AsyncSessionFactory`, `get_db()` FastAPI dependency
- `exceptions.py` — `PlatformException` hierarchy (`NotFoundException`, `UnauthorizedException`,
  `ForbiddenException`, `ConflictException`) + `register_exception_handlers(app)`
- `storage.py` — MinIO client helpers (`get_minio_client`, `ensure_bucket_exists`,
  `generate_presigned_url`, `StorageService`)
- `middleware.py` — `RequestIDMiddleware` (structlog request-id binding) and `RateLimitMiddleware` (an
  in-process sliding-window limiter guarding login/register/resume endpoints, 429 on limit; a shared
  Redis-backed limiter is the stated production-scale follow-up)
- `health.py`, `logging.py`, `schemas.py` (shared response envelopes)

### AI layer: provider-agnostic via LiteLLM

All AI calls go through LiteLLM — application code never imports provider SDKs (OpenAI/Anthropic/Gemini)
directly. The chain is: `app/agents/*` → `app/services/ai/service.py` (`AIService`) →
`app/agents/llm_client.py` (`LLMClient.complete()` / `complete_structured_json()`) → `litellm.acompletion`.

- `LLMClient` resolves the model from `settings.AI_PROVIDER`/`AI_MODEL` (`"provider/model"` format) and
  tries a primary model then a list of `AI_FALLBACK_PROVIDERS` fallbacks in order on failure.
- `ResumeParserAgent.parse_resume_text()` and `JobEnricherAgent.enrich_job()` are the two concrete agents,
  both prompting for structured JSON output (parsed via `complete_structured_json`, with a regex fallback
  for markdown-fenced JSON).
- Dev default is `AI_PROVIDER=groq` (`llama-3.1-8b-instant`) falling back to local Ollama models
  (`qwen2.5`, `qwen2.5-coder`, `deepseek-coder`) — see `.env.example` and `docs/ai-providers.md`.

### Celery: queues and scheduled tasks

`app/workers/celery_app.py` builds the app with 4 named queues (`default`, `jobs`, `ai`, `matching`),
JSON-only serialization, `task_acks_late=True`, and a `beat_schedule` with 3 cron jobs: job-source sync
(every 6h), trending-skills refresh (every 12h), stale-match recompute (daily 2am). Task implementations
live in `app/workers/tasks/{ai,jobs,matching}.py` — these use `AsyncSessionFactory` directly (via
`asyncio.run(...)`) rather than the FastAPI `get_db` dependency, since Celery workers run outside the
request/response cycle.

### Job aggregators

`app/domains/jobs/aggregators/base.py` defines `BaseAggregator(ABC)` with an abstract
`fetch_jobs() -> List[JobPostCreate]`. Five concrete adapters (`remoteok.py`, `arbeitnow.py`,
`remotive.py`, `usajobs.py`, `themuse.py`) each hit one external job board API via `httpx.AsyncClient`
and normalize results into `JobPostCreate`. `JobService.sync_all_job_sources()` fans out across all of
them; this is what the Celery beat schedule and `POST /jobs/seed_demo` ultimately drive.

### Frontend structure

`apps/web/src/app/` is the Next.js App Router, with plain nested folders (no route groups) mapping
directly to personas: `engineer/*`, `company/*`, `admin/dashboard`, plus shared `auth/*`, `jobs/*`,
`projects/*`, `network/*`, `messages/*`. `src/hooks/` has one TanStack Query hook per resource
(`useJobs`, `useEngineerProfile`, `useCompanyJobs`, etc.). `src/lib/api.ts` is the shared axios instance:
it attaches `Authorization: Bearer <token>` from `localStorage`, and its response interceptor
auto-retries once on 401 via `POST /auth/refresh`.

Styling is a hand-rolled Tailwind v4 "enterprise" design system in `globals.css` (CSS-first
`@import "tailwindcss";`, custom variables, utility classes like `.card-enterprise`, `.btn-primary-brand`,
`.pill-match-*`) plus a `tailwind.config.js` color palette — not shadcn/ui, despite
`docs/architecture/ARCHITECTURE.md` describing shadcn/ui as the intended choice. Follow the existing
`globals.css` conventions for new UI rather than introducing a component library.

## Documentation caveats

`docs/CURRENT_STATE.md` and `docs/architecture.md` are stale relative to the actual code in multiple
places — e.g. `CURRENT_STATE.md` still describes `RateLimitMiddleware` as an unimplemented passthrough
stub, which is no longer true (see above), and both files describe some domain files as empty or
Celery tasks as stubs when real implementations now exist. Treat anything in `docs/` describing "current"
implementation status as a hint to verify, not a source of truth — check the actual source before relying
on it.

## Screenshot verification tooling

`screenshot-pages/` (repo root, not yet committed) holds a Playwright-based screenshot capture tool
(`tools/capture-screenshots.js`) that renders desktop/mobile viewports of app pages for manual visual
verification — added alongside a "production-grade local deployment verification" pass. Not a test
framework substitute; treat it as a manual QA aid, not something wired into CI.
