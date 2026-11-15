# Local setup

Prerequisites: Node 22+, Python 3.11, Docker.

```bash
cp .env.example .env
npm ci
docker compose -f infra/docker/docker-compose.yml up -d postgres redis minio minio-init

cd apps/api
python3.11 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload                               # API :8000
.venv/bin/celery -A app.worker.celery_app worker -Q default,imports   # optional: background work
.venv/bin/celery -A app.worker.celery_app beat                        # optional: scheduler (one only)

cd apps/web && npm run dev       # web :3000
cd apps/admin && npm run dev     # staff console
```

Or run worker and scheduler in compose: `docker compose -f infra/docker/docker-compose.yml up -d worker scheduler`.
`TASKS_ALWAYS_EAGER=true` runs tasks inline without a broker.

- **Sign-in locally:** use the mock identity servers from the e2e suite (`tests/e2e/mock-workos`,
  `tests/e2e/mock-supabase`) or a WorkOS staging client. Never point a local stack at production data or
  production keys.
- **AI:** set at least one free-tier key (`GROQ_API_KEY` recommended); without one AI features report
  "unavailable" and everything else works.
- **Storage:** MinIO stands in for Oracle Object Storage (same S3 API, `MINIO_*` settings).
- **Email:** leave `EMAIL_PROVIDER` unset locally; messages stay in `email_outbox`.
- **Next.js:** this repo pins versions with breaking changes; read `apps/web/CLAUDE.md` and
  `node_modules/next/dist/docs/` before writing frontend code.
