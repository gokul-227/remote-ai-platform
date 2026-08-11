# $0 Deployment Guide

Target architecture, all genuinely free tiers, no payment method required for any of them:

| Layer | Provider | Why |
|---|---|---|
| Frontend | Vercel (Hobby) | Native Next.js support, free subdomain |
| API | Render (Free web service) | Free container hosting; see cold-start caveat below |
| Database | Supabase (Free Postgres) | Render's free Postgres is temporary — do not use it (see `infra/deploy/render.yaml`) |
| File storage | Supabase Storage (S3-compatible) | Free tier, no card required; verified compatible with this app's boto3 client (see below) |
| Scheduled job sync | GitHub Actions cron | Replaces Celery beat — no hosted Redis/worker needed |
| CI | GitHub Actions | Already wired in `.github/workflows/ci.yml` |

No Redis, no Celery worker/beat, no self-hosted Keycloak are deployed to production. Here's why each is
safe to drop, verified against the actual code (not assumed):
- **Redis**: `RateLimitMiddleware` is in-process (works with zero Redis). The network chat's cross-worker
  Redis pub/sub automatically falls back to local in-memory broadcast if Redis is unavailable — and a
  single free-tier instance has no "other workers" to broadcast to anyway.
- **Celery/beat**: only used for the 3 scheduled jobs (source sync, trending-skills refresh, stale-match
  recompute). Source sync is replaced by `.github/workflows/scheduled-job-sync.yml`. The other two are
  lower-value for an MVP and can be triggered manually via the admin console if needed later.
- **Keycloak**: confirmed by reading `apps/api/app/domains/auth/router.py` — registration sets
  `keycloak_id=str(uuid.uuid4())`, a locally generated placeholder. The app never makes a network call to
  a real Keycloak server for login/register/token verification. It's present in `docker-compose.yml` for
  local dev only; production doesn't need it running anywhere.

## Prerequisites you need to do (I cannot do these — no payment method needed for any of them)

### 1. Supabase project (database + storage)

1. Create a free project at supabase.com (no card required for the free tier).
2. **Database**: Project Settings → Database → copy the connection string. Use the **connection pooler**
   URI (port 6543, `?pgbouncer=true`) if available — Render's free tier and Supabase's free tier both
   have limited concurrent connections. Convert it to the asyncpg driver form:
   `postgresql+asyncpg://postgres:<password>@<host>:6543/postgres`
3. **Storage**: Project Settings → Storage → S3 Connection. Create two buckets: `remote-ai-platform-resumes`
   (keep private) and `remote-ai-platform-assets` (can be public). Generate an S3 access key/secret pair
   from the storage settings page.
   - `MINIO_ENDPOINT` = `<project-ref>.supabase.co/storage/v1/s3` (this app's storage client now uses
     boto3 specifically because it — unlike the previous minio SDK — supports a path component in the
     endpoint URL; verified locally against MinIO's own S3-compatible API in this same code path, see
     `docs/ACTUAL_SYSTEM_AUDIT.md`. If Supabase's exact endpoint format differs when you set this up,
     the fix is only ever in `_endpoint_url()` in `apps/api/app/core/storage.py`, not a re-architecture.)
   - `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` = the S3 keys from that page
   - `MINIO_SECURE` = `true`
4. Run migrations against this database once, from your machine (needs Python 3.11 — use the Docker
   `test` image if you don't have 3.11 installed, same as local dev):
   ```bash
   docker run --rm -e DATABASE_URL="postgresql+asyncpg://postgres:<password>@<host>:5432/postgres" \
     -e JWT_SECRET_KEY="temporary-for-migration-only-32-chars-min" \
     remote-ai-platform-test alembic upgrade head
   ```

### 2. Render (API)

1. Create a free account at render.com (no card required for free web services).
2. New → Blueprint → point at this repo, it will read `infra/deploy/render.yaml`.
3. In the Render dashboard, set these env vars manually (not committed to git):
   - `DATABASE_URL` — from Supabase, step 1
   - `JWT_SECRET_KEY` — generate with `openssl rand -hex 32`
   - `CORS_ORIGINS` — your Vercel URL once you have it (step 3), e.g. `https://remote-ai-platform.vercel.app`
   - `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_SECURE` — from Supabase, step 1
   - `MINIO_PUBLIC_ENDPOINT` — same as `MINIO_ENDPOINT` with `https://` prefix
   - `KEYCLOAK_CLIENT_SECRET` — any random string (not used for real verification, but
     `validate_production_settings()` rejects the placeholder default at boot — see
     `apps/api/app/core/config.py`)
   - `AI_PROVIDER` = `groq`, `AI_API_KEY` = a free Groq API key from console.groq.com (no card required)
     — optional; if omitted, AI features degrade gracefully to generic defaults rather than failing
     (already verified in `docs/ACTUAL_SYSTEM_AUDIT.md`'s AI-degradation section)
4. Deploy. **Cold start**: Render's free tier spins the service down after ~15 minutes idle; the next
   request takes 10-60 seconds to wake it up. Not fixable at $0 — document it as a known limitation, don't
   try to work around it with a paid tier or a keep-alive ping (that just burns the free tier's monthly
   request/hour budget for no real benefit).

### 3. Vercel (frontend)

1. Create a free account at vercel.com (no card required for Hobby tier).
2. Import this repo, set **Root Directory** to `apps/web` in project settings (monorepo — `apps/web/vercel.json`
   handles installing from the repo root so npm workspaces resolve correctly).
3. Set env var `NEXT_PUBLIC_API_URL` = your Render API URL + `/api/v1`, e.g.
   `https://remote-ai-platform-api.onrender.com/api/v1`.
4. Deploy. Do not add a custom domain — use the free `*.vercel.app` subdomain.

### 4. GitHub Actions secrets (for the scheduled job sync)

In this repo's Settings → Secrets and variables → Actions:
- Secret `PROD_ADMIN_EMAIL` / `PROD_ADMIN_PASSWORD` — credentials of an admin account that exists on the
  deployed database (the seed script creates `admin@workmesh.ai` / `admin123` — **change this password in
  production** before relying on it, or create a separate admin account).
- Variable `PROD_API_URL` — e.g. `https://remote-ai-platform-api.onrender.com/api/v1`

## What to hand back to me once these exist

Once you've done the above, tell me and share (not the secrets themselves, just confirmation + URLs):
- The Render service URL
- The Vercel deployment URL
- Confirmation the Supabase migration ran cleanly

I'll then run the same acceptance checklist against the live URLs that Phase 0 ran locally (register →
login → jobs → matching → admin dashboard → resume upload), and report back honestly which parts work
against the real deployment versus what only worked locally.

## Known free-tier limitations (be upfront about these, don't hide them)

- **Render cold starts**: 10-60s wake-up after 15 min idle. Real product impact: the first visitor after
  a quiet period waits.
- **Supabase free Postgres**: pauses after 7 days with zero activity (resumes automatically on next
  connection, takes ~1 minute). The GitHub Actions job-sync cron running every 6h should keep it from ever
  going idle for that long.
- **No Redis in production**: rate limiting is per-instance (fine for a single free Render instance,
  would need revisiting if ever scaled to multiple instances). Chat falls back to local broadcast (also
  fine for a single instance).
- **AI features require a free Groq key to do anything beyond generic defaults.** Groq's free tier has its
  own rate limits; under load, resume parsing/job enrichment will silently degrade further (already
  graceful, not a crash) — this is inherent to using a free AI tier, not a bug in this app.
- **Celery beat's other two scheduled jobs (trending-skills refresh, stale-match recompute) are not
  replaced by a GitHub Actions cron in this pass** — only job-source sync is. They can be triggered
  manually via a follow-up admin action if needed, or a second scheduled workflow added later the same way.
