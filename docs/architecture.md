# WorkMesh AI — System Architecture

## 1. Architectural Style: Domain-Oriented Modular Monolith
WorkMesh AI is structured as a **modular monolith** rather than microservices to preserve development speed, operational simplicity, and data consistency while enforcing domain boundaries.

```
                    ┌──────────────────────────────────┐
                    │    Next.js 16 (apps/web)         │
                    └─────────────────┬────────────────┘
                                      │ REST / WebSockets
                                      ▼
                    ┌──────────────────────────────────┐
                    │     FastAPI (apps/api)           │
                    │   ┌──────────────────────────┐   │
                    │   │ Domains:                 │   │
                    │   │ auth, engineers,         │   │
                    │   │ companies, jobs,         │   │
                    │   │ matching, network,       │   │
                    │   │ messaging, projects,     │   │
                    │   │ admin, notifications     │   │
                    │   └──────────────────────────┘   │
                    └──────┬──────────┬─────────┬──────┘
                           │          │         │
          ┌────────────────┘          │         └────────────────┐
          ▼                           ▼                          ▼
   ┌──────────────┐            ┌──────────────┐           ┌──────────────┐
   │ PostgreSQL16 │            │   Redis 7    │           │ MinIO (S3)   │
   └──────────────┘            └──────┬───────┘           └──────────────┘
                                      │
                                      ▼
                               ┌──────────────┐
                               │ Celery 5     │
                               │ Worker/Beat  │
                               └──────┬───────┘
                                      │
                                      ▼
                               ┌──────────────┐
                               │ Job Sources  │
                               └──────────────┘
```

## 2. Core Domain Layering
Each bounded context in `apps/api/app/domains/` follows strict internal layering:
```
domain/
  models.py       # SQLAlchemy ORM Models
  schemas.py      # Pydantic Schemas (Request/Response validation)
  repository.py   # Database Access & Querying Layer
  service.py      # Core Business & Domain Logic
  router.py       # FastAPI Route Handler
```

## 3. Technology Stack & Infrastructure
- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + TanStack Query.
- **Backend API**: FastAPI + Async SQLAlchemy 2 + Alembic migrations + Pydantic v2.
- **Database**: PostgreSQL 16.
- **Caching & Task Queue**: Redis 7 + Celery 5 (Queues: `default`, `jobs`, `ai`, `matching`).
- **Object Storage**: MinIO (S3-compatible API).
- **Authentication**: JWT authentication with Keycloak OIDC integration support.
- **AI Integration**: LiteLLM abstraction layer supporting Groq, Ollama (local models), OpenAI, Gemini, and custom providers.

## 4. Architectural Rules
1. **No Microservices**: Keep all domains inside the single codebase.
2. **Layered Separation**: Routers must NOT contain direct business logic or DB calls; delegate to Services and Repositories.
3. **Vendor Independence**: Wrap AI, Auth, Storage, Notifications, and Aggregators in abstraction interfaces.
4. **Free-First**: Ensure the system runs completely locally without requiring paid SaaS tools.
