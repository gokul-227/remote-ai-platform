# Future AWS Migration Map

Companion to `docs/architecture/FORENSIC_AUDIT.md` and `docs/infrastructure/FREE_TIER_ARCHITECTURE.md`. This is a mapping exercise, not a plan to execute now — nothing here should be actioned until there's a real reason (sustained paid usage, a demonstrated free-tier wall) to spend money.

| Current ($0) | Future AWS | Why it maps cleanly |
|---|---|---|
| Vercel (Next.js frontend) | CloudFront + S3, or Amplify Hosting | Next.js build output is portable; no Vercel-specific APIs are used in `apps/web` beyond standard Next.js conventions |
| Render (FastAPI, Docker) | ECS Fargate (or EKS if the org already runs Kubernetes elsewhere) | The app is already a standard Docker image (`apps/api/Dockerfile`) with no Render-specific runtime dependency — `RENDER_EXTERNAL_URL` is the only Render-specific env var read anywhere (`app/domains/auth/oauth.py`), trivially replaceable |
| Supabase Postgres | RDS / Aurora PostgreSQL | Already plain PostgreSQL via SQLAlchemy/asyncpg — no Supabase-specific SQL features are used in migrations or queries; the only Supabase-specific concern is the pooler mode (session vs transaction), which becomes moot on RDS |
| Supabase Storage (S3-compatible) | AWS S3 directly | Already accessed via boto3's S3 API (`app/core/storage.py`) specifically so this migration requires no code change — only an endpoint/credential swap |
| No Redis in production today | ElastiCache (Redis) | Would finally make Celery/rate-limiting/OAuth-state-store fully functional in production as designed |
| No worker in production today | ECS worker service (same image, `celery worker` command) | The Celery app (`app/workers/celery_app.py`) already supports this out of the box — it's a deployment gap, not a code gap |
| GitHub Actions cron | EventBridge Scheduler → SQS/Lambda, or just keep Celery beat on an ECS task | Either works; Celery beat becomes viable once a persistent worker exists |
| Direct Google/Microsoft OAuth2 | Unchanged, or fronted by Cognito/Entra federation if enterprise SSO is ever required | The current direct-integration code doesn't need to change to add Cognito later — it would sit alongside, not replace, unless enterprise customers specifically require SAML/OIDC federation |
| Groq/Ollama via LiteLLM | Add AWS Bedrock as another LiteLLM-routed candidate | `LLMClient`'s fallback-chain design already supports adding another `"provider/model"` candidate with no architectural change |
| No CDN today | CloudFront (if not already covered by the frontend's own CDN choice) | — |
| No monitoring/observability stack beyond structlog + health endpoints | CloudWatch Logs/Metrics, or OpenTelemetry → any backend | `RequestIDMiddleware` already tags every request; wiring that to CloudWatch is additive, not a rewrite |

## What does NOT need to change

Business/domain logic (`app/domains/*/service.py`), the SQLAlchemy models, the Pydantic schemas, the FastAPI routers, and the Next.js frontend code are all already cloud-agnostic — none of them import a Render, Vercel, or Supabase SDK directly. The migration is an infrastructure/ops exercise, not an application rewrite, which is the property this document exists to confirm and preserve going forward: any future infra change should be checked against "does this leak a provider-specific SDK into domain code" before merging.
</content>
