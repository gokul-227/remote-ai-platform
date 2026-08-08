# Remote AI Platform — Deployment Guide

This document outlines the validated free-first deployment topology and the contracts required before exposing the platform publicly.

---

## Architecture Overview

```
 ┌────────────────┐       ┌────────────────┐
 │ Vercel          │ ────> │ Render API     │
 │ (Next.js App)  │       │ (FastAPI API)  │
 └────────────────┘       └────────┬───────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
      ┌───────▼───────┐    ┌───────▼───────┐    ┌───────▼───────┐
      │ Neon Postgres │    │ Supabase /    │    │ Groq / Gemini │
      │ / Supabase DB │    │ MinIO S3      │    │ Groq AI       │
      └───────────────┘    └───────────────┘    └───────────────┘
```

---

## 1. Database (Neon / Supabase PostgreSQL)

### Neon (Free Tier)
1. Sign up at [neon.tech](https://neon.tech).
2. Create a new project named `remote-ai-platform-db`.
3. Enable `uuid-ossp` and `pg_trgm` extensions via SQL console:
   ```sql
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   CREATE EXTENSION IF NOT EXISTS "pg_trgm";
   ```
4. Copy the connection string (`postgres://...`).

### Migration Step
Run Alembic migrations against the production database:
```bash
DATABASE_URL="postgresql+asyncpg://user:pass@ep-xyz.neon.tech/remote_ai_platform?ssl=require" alembic upgrade head
```

---

## 2. Backend API (Render)

### Render (Free Web Service)
1. Sign up at [render.com](https://render.com).
2. Create a new **Web Service** connected to the repository, with root directory `apps/api`.
3. Build Command: `pip install -e .`
4. Start Command: `sh start-production.sh`
5. The production startup script runs `alembic upgrade head` before starting Uvicorn.
6. Environment Variables:
   - `DATABASE_URL`: Your Neon/Supabase connection URL.
   - `AI_PROVIDER`: `groq/llama-3.1-70b-versatile` or `gemini/gemini-1.5-flash`
   - `GROQ_API_KEY` / `GEMINI_API_KEY`: Your AI API key.
   - `JWT_SECRET_KEY`: High-entropy random secret key.

---

## 3. Frontend Web Application (Vercel)

### Vercel Deployment
1. Import the repository into [vercel.com](https://vercel.com).
2. Set Root Directory to `apps/web`.
3. Framework Preset: Next.js.
4. Environment Variables:
   - `NEXT_PUBLIC_API_URL`: Your Render backend API URL (e.g. `https://remote-ai-platform-api.onrender.com`).
5. Deploy.

---

## 4. Object Storage (Supabase Storage / Cloudflare R2 / AWS S3)

Remote AI Platform uses standard AWS S3 / MinIO protocol. Set environment variables on the backend:
- `MINIO_ENDPOINT`: `s3.amazonaws.com` or Supabase endpoint
- `MINIO_ACCESS_KEY`: Access key ID
- `MINIO_SECRET_KEY`: Secret access key
- `MINIO_SECURE`: `true`

---

## 5. Required production contract

Set `APP_ENV=production` and provide high-entropy values for `JWT_SECRET_KEY`,
`KEYCLOAK_CLIENT_SECRET`, and `MINIO_SECRET_KEY`. The API now fails fast if known development
secrets are used in production.

Configure these service URLs with public/private reachability appropriate to the provider:

- `DATABASE_URL`: Neon or Supabase PostgreSQL connection string with SSL.
- `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`: managed Redis endpoint(s).
- `MINIO_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT`, `MINIO_SECURE=true`: S3-compatible storage.
- `NEXT_PUBLIC_API_URL`: the Render API origin only; the frontend appends `/api/v1`.

## 6. Post-Deployment Verification

1. Verify `GET https://<api>/api/v1/health` returns database `ok`.
2. Verify `GET https://<api>/api/v1/health/queues` returns queue status (or an explicit degraded broker state).
3. Access your deployed Vercel frontend URL.
4. `POST /api/v1/jobs/seed_demo` is disabled whenever `APP_ENV=production` (returns 403) — it's a
   local/staging convenience only. In production, populate real data via the job aggregator sync
   (`POST /api/v1/jobs/sync`, admin-only — same job Celery beat runs every 6 hours) or by having
   companies post jobs directly.
5. Test browsing jobs, filtering, registering as both an Engineer and a Company, creating profiles,
   posting a job, and AI match scoring.
6. Set `JWT_SECRET_KEY`, `KEYCLOAK_CLIENT_SECRET`, `POSTGRES_PASSWORD`, and `MINIO_SECRET_KEY` to real
   high-entropy secrets — the values in `.env.example`/`infra/docker/docker-compose.yml` are
   local-development defaults only and must never be reused in a real deployment.
