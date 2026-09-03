# Free-Tier Infrastructure — Current State and Limitations

Companion to `docs/architecture/FORENSIC_AUDIT.md`. Documents exactly what's free today, what breaks under that constraint, and what it would take to remove each limitation.

| Component | Provider | Plan | Real limitation | Failure behavior | Migration trigger |
|---|---|---|---|---|---|
| Frontend hosting | Vercel | Hobby (free) | Build minutes/bandwidth caps on the free tier; no SLA | Would need a paid plan under sustained real traffic | Real user traffic approaching free-tier bandwidth/build limits |
| Backend hosting | Render | Free web service, 512MB RAM, 1 instance | Cold starts after 15 min idle (accepted, documented, not being re-investigated per explicit user decision); 512MB is too small for a second process (Celery worker, Keycloak) to run alongside the API | Backend sleeps under low traffic; any attempt to add a worker/broker process on the same free instance fails or starves the API | Paid Render plan (~$7-25/mo) removes cold starts and allows a second (worker) service |
| Database | Supabase | Free Postgres project | Row/storage caps, project pauses after prolonged inactivity, session-mode pooler required (not the transaction-mode pooler) — already correctly handled via `statement_cache_size: 0` in `alembic/env.py` | Project pause would cause an outage until manually resumed | Real data volume approaching Supabase free tier caps, or need for the transaction-mode pooler / dedicated compute |
| Object storage | Supabase Storage (S3-compatible via boto3) | Free tier | Storage caps; egress caps | Uploads fail once cap is hit | Migrate to AWS S3 or a paid Supabase tier |
| Cache/broker | Redis | **Not deployed in production at all** | No free Redis is currently provisioned for production | Every Redis-dependent feature (Celery broker, `RateLimitMiddleware`'s distributed limiter, OAuth state store if ever moved off in-memory) runs in its in-memory/degraded fallback mode in production today | Add a free-tier hosted Redis (e.g. Upstash free tier) — genuinely low-effort, currently just not done |
| Background jobs | GitHub Actions cron (substituting for Celery beat) | Free (public/private repo minutes) | Only replaces one of three scheduled jobs (job-source sync); the other two (trending skills, stale matches) have no substitute and don't run at all in production | Two features are silently inert in production | A real Celery worker + hosted Redis, or expand the GitHub Actions cron pattern to cover the other two jobs |
| Identity | Self-hosted Keycloak | **Rejected** — confirmed empirically unable to boot in Render's free 512MB tier (three separate boot-flag experiments, identical OOM-consistent failure) | N/A — not deployed | Direct OAuth2 (Google/Microsoft) implemented instead, see `FORENSIC_AUDIT.md` | A paid Render instance (or separate host) with enough RAM, if a broker architecture is ever wanted again |
| AI | Groq (cloud) + local Ollama fallback | Free tier / self-hosted | Groq free tier has request-rate limits; Ollama fallback requires a local model host that doesn't exist in production (so in production, Ollama fallback effectively cannot fire — it can only ever fall back to whatever other cloud provider is configured, if any) | AI features degrade to fallback failures if Groq's free tier is exhausted and no other cloud fallback is configured in production | Add a second cloud fallback provider (e.g. OpenAI) with its own free/cheap tier, or pay for Groq's paid tier |
| CDN/edge | **None** | N/A | No Cloudflare or equivalent in front of Vercel/Render today, despite the aspirational architecture diagram | No DDoS/edge caching protection beyond what Vercel/Render provide natively | Add Cloudflare free tier — genuinely low-effort, currently just not done |

## What's currently broken due to the free-tier constraint (not hypothetical)

Per the forensic audit: the production Render service currently has its environment variables wiped down to 4 non-secret values, which is an operational incident, not a free-tier limitation — but it's compounded by the free tier's single-instance nature (no staging slot to validate against before it affects the only running instance).

## Honest assessment

The $0 architecture is a real, working trade-off, not a facade — the accepted limitations (cold starts, no dedicated worker, two dormant scheduled jobs) are documented above rather than hidden, per the product owner's explicit standing instruction to never claim a component is more reliable than it is.
</content>
