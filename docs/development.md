# Development Guide

## Prerequisites

- Docker + Docker Compose (recommended path — see below)
- Node.js 20+ and npm 10+ (for running the frontend outside Docker)
- Python 3.11 (for running the backend/tests outside Docker) — **do not** use a Python 3.14 interpreter;
  `pydantic-core` (pinned via `pydantic==2.10.3`) does not build on 3.14. Use Docker or a 3.11 venv.

## Local infrastructure

```bash
cp .env.example .env
docker compose -f infra/docker/docker-compose.yml up -d
```

This starts the 9 core services: `postgres`, `redis`, `minio` + `minio-init`, `keycloak`, `api`, `web`,
`celery-worker`, `celery-beat`. All application containers bind-mount their source directories with
hot-reload (`uvicorn --reload`, `next dev`), so local edits apply without a rebuild — rebuild only when
you change `pyproject.toml`/`package.json` or a Dockerfile.

| Service | URL | Notes |
|---|---|---|
| Web app | http://localhost:3000 | Next.js frontend |
| API docs | http://localhost:8000/docs | Swagger UI |
| Keycloak admin | http://localhost:8080 | `admin` / see `.env` |
| MinIO console | http://localhost:9001 | `minioadmin` / see `.env` |

Seed demo job data (disabled once `APP_ENV=production`):
```bash
curl -X POST http://localhost:8000/api/v1/jobs/seed_demo
```

## Backend (apps/api)

```bash
cd apps/api
python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

uvicorn app.main:app --reload          # run directly, port 8000
alembic upgrade head                    # apply migrations
alembic revision --autogenerate -m "description"

pytest                                  # full suite (in-memory SQLite, no external services needed)
pytest tests/test_jobs.py -v            # single file
pytest tests/test_jobs.py::test_name    # single test

ruff check .                            # lint
mypy app                                # type check
```

Or run tests inside the built container without a local interpreter at all:
```bash
docker build -f apps/api/Dockerfile --target development -t remote-ai-api:dev apps/api
docker run --rm -v "$(pwd)/apps/api:/app" -w /app remote-ai-api:dev pytest -q
```

## Frontend (apps/web)

```bash
cd apps/web
npm install
npm run dev             # port 3000
npm run build            # production build (Turbopack)
npm run lint
```

There is currently no frontend test suite (no jest/vitest/playwright configured).

## Database migrations

Migrations live in `apps/api/alembic/versions/`, numbered `001_...` through `009_...`. When adding a new
domain model, import its `models` module in `apps/api/alembic/env.py` (all domains must be imported there
for `--autogenerate` to see their tables) before generating a migration.

## AI configuration

See [ai-providers.md](ai-providers.md) for configuring Groq, Ollama, or another LiteLLM-supported
provider via `AI_PROVIDER`/`AI_MODEL`/`AI_FALLBACK_PROVIDERS`.

## Monorepo commands (Turborepo)

From the repo root:
```bash
npm run dev          # fan out to all workspaces
npm run build
npm run lint
npm run type-check
npm run test
```
