# WorkMesh AI — Architecture Document

> **Living Document** — Updated at the end of every milestone.
> Last Updated: M1 — Project Scaffold & Infrastructure

---

## Business Context

**WorkMesh AI** is an AI-powered remote engineering marketplace. The MVP validates:

1. Engineers onboard and build AI-enriched profiles
2. A background scheduler aggregates real remote jobs from public APIs
3. An AI matching engine recommends jobs to engineers (and engineers to companies)
4. Companies browse engineers and create projects

---

## System Architecture

```
                        ┌─────────────────────────────────┐
                        │         Traefik (Reverse Proxy)  │
                        │  Port 80/443  Dashboard :8090    │
                        └────────────┬────────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
    ┌─────────▼─────────┐  ┌────────▼───────┐  ┌──────────▼──────────┐
    │   Next.js :3000    │  │  FastAPI :8000  │  │  Keycloak :8080     │
    │  (App Router)      │  │  (REST API)     │  │  (OIDC/OAuth2)      │
    │  Tailwind shadcn   │  │  /api/v1/*      │  │  realm: workmesh    │
    └───────────────────┘  └────────┬───────┘  └────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
          ┌─────────▼────┐  ┌────────▼─────┐  ┌──────▼──────┐
          │  PostgreSQL   │  │    Redis      │  │   MinIO     │
          │  Port 5432    │  │  Port 6379    │  │  Port 9000  │
          │  + pgvector   │  │  Cache+Queue  │  │  Resumes    │
          └──────────────┘  └──────────────┘  └─────────────┘
                    │
          ┌─────────▼──────────────────────────┐
          │         Celery Workers              │
          │  ┌──────────┐  ┌──────────────┐   │
          │  │ Job Sync  │  │ AI Agents    │   │
          │  │ (every6h) │  │ Resume/Match │   │
          │  └──────────┘  └──────────────┘   │
          └──────────────┬─────────────────────┘
                         │
          ┌──────────────▼─────────────────────┐
          │        Ollama (Local AI)            │
          │  qwen2.5 / qwen2.5-coder /          │
          │  deepseek-coder (host machine)      │
          │  Port 11434                         │
          └──────────────┬─────────────────────┘
                         │ (via LiteLLM — swappable)
          ┌──────────────▼─────────────────────┐
          │    Public Job APIs (HTTP)           │
          │  RemoteOK | Arbeitnow | Remotive    │
          │  USAJobs | TheMuse                  │
          └────────────────────────────────────┘
```

---

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend framework | FastAPI | Async-native, automatic OpenAPI, type-safe with Pydantic |
| ORM | SQLAlchemy 2 async | Industry standard, full async support, Alembic migrations |
| Database | PostgreSQL 16 | FTS, pg_trgm, UUID, JSONB, future pgvector |
| Cache / Queue | Redis 7 | Single service for both caching and Celery broker |
| Background jobs | Celery 5 + APScheduler | Mature, distributed, retry support |
| Object storage | MinIO | S3-compatible, self-hostable, no vendor lock-in |
| Auth | Keycloak 24 | Enterprise OIDC/OAuth2, GitHub+Google SSO, role management |
| AI gateway | LiteLLM | Provider-agnostic, supports Ollama → Groq → OpenAI seamlessly |
| Local AI | Ollama | User has qwen2.5, qwen2.5-coder, deepseek-coder installed |
| Production AI | Groq (free tier) | Fast inference, OpenAI-compatible API, free tier available |
| Frontend | Next.js 15 App Router | Server components, RSC streaming, layout system |
| UI components | shadcn/ui + Tailwind | Accessible, composable, no bundle bloat |
| Data fetching | TanStack Query v5 | Caching, mutations, background refetch |
| Forms | React Hook Form + Zod | Performance, type-safe validation |
| Reverse proxy | Traefik v3 | Auto service discovery, Docker-native routing |
| Monitoring | Prometheus + Grafana + Loki | Full observability stack, self-hostable |
| Monorepo | Turborepo | Build caching, task orchestration, scales to enterprise |

---

## Repository Structure

```
workmesh-ai/
├── apps/
│   ├── api/                    # FastAPI backend (modular monolith)
│   │   ├── app/
│   │   │   ├── core/           # Config, DB, middleware, logging, exceptions
│   │   │   ├── domains/        # Business domains (feature slices)
│   │   │   │   ├── auth/       # Users, roles, tokens, OAuth
│   │   │   │   ├── engineers/  # Engineer profiles, skills, resume
│   │   │   │   ├── companies/  # Company profiles, projects, bookmarks
│   │   │   │   ├── jobs/       # Job aggregation, normalization
│   │   │   │   ├── search/     # FTS, filters, trending
│   │   │   │   ├── matching/   # AI match scores, recommendations
│   │   │   │   └── admin/      # Admin endpoints
│   │   │   ├── agents/         # LiteLLM AI agents
│   │   │   └── workers/        # Celery tasks + beat schedule
│   │   ├── alembic/            # Database migrations
│   │   └── tests/
│   └── web/                    # Next.js 15 frontend
│       └── src/
│           ├── app/            # App Router pages & layouts
│           ├── components/     # Reusable UI components
│           ├── hooks/          # Custom React hooks
│           ├── lib/            # API client, utilities
│           └── types/          # TypeScript types
├── packages/
│   ├── ui/                     # Shared shadcn/ui components (future)
│   ├── config/                 # ESLint, TypeScript, Tailwind configs
│   └── shared/                 # Shared TypeScript types/schemas
├── infra/
│   ├── docker/                 # docker-compose.yml + init scripts
│   ├── traefik/                # Reverse proxy config
│   ├── keycloak/               # Realm export, themes
│   └── monitoring/             # Prometheus, Grafana, Loki, Promtail
├── docs/
│   ├── architecture/           # This document + diagrams
│   ├── api/                    # OpenAPI exports
│   └── guides/                 # Setup, deployment
├── scripts/                    # seed.py, dev helpers
├── tests/e2e/                  # End-to-end tests
└── .github/workflows/          # CI/CD
```

---

## Domain Model

### Bounded Contexts

```
┌─── Auth ─────────────────────────────────────────────────────┐
│  User, Role, RefreshToken, OAuthAccount                       │
└──────────────────────────────────────────────────────────────┘

┌─── Engineers ────────────────────────────────────────────────┐
│  EngineerProfile, Skill, EngineerSkill, Experience,          │
│  Language, ResumeUpload                                       │
└──────────────────────────────────────────────────────────────┘

┌─── Companies ────────────────────────────────────────────────┐
│  CompanyProfile, Project, EngineerBookmark, EngineerInvite   │
└──────────────────────────────────────────────────────────────┘

┌─── Jobs ─────────────────────────────────────────────────────┐
│  Job, JobSkill, ApiSyncLog                                    │
└──────────────────────────────────────────────────────────────┘

┌─── Matching ─────────────────────────────────────────────────┐
│  Match, Recommendation, SavedJob                             │
└──────────────────────────────────────────────────────────────┘

┌─── Admin ────────────────────────────────────────────────────┐
│  ActivityLog, Notification                                    │
└──────────────────────────────────────────────────────────────┘
```

---

## API Design

- All endpoints versioned under `/api/v1/`
- Consistent `APIResponse<T>` envelope: `{ success, data, message }`
- Paginated responses: `{ items, total, page, page_size, total_pages, has_next, has_prev }`
- Errors: `{ success: false, error: string, details: [{ field, message, code }] }`
- Auth: Bearer token (Keycloak JWT) in `Authorization` header
- Correlation: `X-Request-ID` header on every request/response

---

## AI Agent Architecture

```
BaseAgent (LiteLLM)
    │
    ├── ResumeAgent     → Parse PDF → skills[], summary, missing_skills[]
    ├── JobAgent        → Job description → skills[], seniority, remote_type
    ├── MatchingAgent   → Engineer + Job → per-factor scores + explanation
    ├── RecommendationAgent → Engineer + Pool → ranked list + reasons
    ├── ProfileAgent    → Profile draft → improved summary, suggestions[]
    └── ProjectAgent    → Project draft → improved description, required skills[]
```

**Provider chain** (via LiteLLM):
1. Ollama/qwen2.5 (dev — local)
2. Groq/llama-3.1-70b-versatile (prod — free tier)
3. OpenAI/gpt-4o-mini (fallback — paid)

---

## Job Aggregator Pipeline

```
APScheduler (every 6h)
    │
    ▼ Celery chord (parallel)
    ├── RemoteOKFetcher
    ├── ArbeitnowFetcher  
    ├── RemotiveFetcher
    ├── USAJobsFetcher
    └── TheMuseFetcher
    │
    ▼ Normalizer → canonical JobSchema
    │
    ▼ Deduplicator → upsert by (external_id, source)
    │
    ▼ JobAgent → extract skills (async, queued)
    │
    ▼ PostgreSQL FTS index refresh
    │
    ▼ ApiSyncLog record
```

---

## Security Architecture

- **Authentication**: Keycloak OIDC (JWT RS256 tokens)
- **Authorization**: Role-based FastAPI dependencies (`require_role`)
- **Roles**: `engineer`, `company`, `admin`
- **OAuth SSO**: GitHub + Google (via Keycloak Identity Providers)
- **File uploads**: Validated MIME type, max size, stored in MinIO (not served directly)
- **Secrets**: All in environment variables, never hardcoded
- **CORS**: Configured per environment

---

## Milestone Progress

| Milestone | Status |
|-----------|--------|
| M1 — Scaffold & Infrastructure | ✅ Complete |
| M2 — Authentication Domain | 🔲 Pending |
| M3 — Engineer Profile Domain | 🔲 Pending |
| M4 — Company Profile Domain | 🔲 Pending |
| M5 — Job Aggregator | 🔲 Pending |
| M6 — AI Agents | 🔲 Pending |
| M7 — Search & Discovery | 🔲 Pending |
| M8 — AI Matching Engine | 🔲 Pending |
| M9 — Company Dashboard | 🔲 Pending |
| M10 — Admin Dashboard | 🔲 Pending |
| M11 — Frontend | 🔲 Pending |
| M12 — Monitoring & CI/CD | 🔲 Pending |
