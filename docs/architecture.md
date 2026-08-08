# WorkMesh AI — System Architecture & Design Specification

## 1. Architectural Style: Domain-Oriented Modular Monolith
WorkMesh AI is structured as a **modular monolith** in a Turborepo monorepo to preserve high development velocity, operational simplicity, and data consistency while enforcing strict domain boundaries.

```
                               ┌───────────────────────────┐
                               │    Next.js 16 Web App     │
                               │ React 19 + TanStack Query │
                               └─────────────┬─────────────┘
                                             │ REST / WebSockets
                                             ▼
                               ┌───────────────────────────┐
                               │     FastAPI 0.115 API     │
                               │   ┌───────────────────┐   │
                               │   │  20 Domain Modules│   │
                               │   └───────────────────┘   │
                               └──────┬──────────┬─────────┘
                                      │          │
                     ┌────────────────┘          └────────────────┐
                     ▼                                            ▼
              ┌──────────────┐                             ┌──────────────┐
              │ PostgreSQL16 │                             │   Redis 7    │
              │ 22 Migrations│                             │ Cache/PubSub │
              └──────────────┘                             └──────┬───────┘
                                                                  │
                                                                  ▼
                                                           ┌──────────────┐
                                                           │   Celery 5   │
                                                           │ Worker/Beat  │
                                                           └──────────────┘
```

---

## 2. Core Domain Architecture

Each domain in `apps/api/app/domains/` follows a standardized package layout:
```
apps/api/app/domains/[domain_name]/
  ├── __init__.py
  ├── models.py       # Async SQLAlchemy ORM Models
  ├── schemas.py      # Pydantic v2 Schemas (Validation & Serialization)
  ├── service.py      # Domain Business Logic & Algorithmic Engines
  └── router.py       # FastAPI Endpoint Handlers
```

### Complete 20-Domain Map:
1. `auth` — Authentication, JWT token management, Keycloak integration
2. `engineers` — Engineer profiles, skills, portfolio, resume parser
3. `companies` — Company profiles, verification, job post management
4. `jobs` — Aggregated job posts, RemoteOK/Remotive sync engine, search
5. `matching` — Multi-factor explainable AI match engine
6. `applications` — Job application state machine lifecycle
7. `network` — Professional connections, user search, friendship states
8. `messaging` — WebSocket real-time chat, persistent conversation history
9. `projects` — Delivery workspace, milestone definitions, project task graph
10. `contracts` — Digital contracts, milestone terms, electronic signatures
11. `trust` — Verified trust score engine, component weighting
12. `payments` — Escrow funds, ledger entries, wallet transactions
13. `social` — Social feed, posts, likes, inline comments
14. `groups` — Developer hubs, group memberships, community posts
15. `quality` — AI Quality Engine, work evaluation, line-by-line code review
16. `admin` — System health telemetry, AI token monitoring, user controls
17. `notifications` — Event-driven notification preferences & delivery
18. `search` — Full-text multi-entity search engine
19. `saved_jobs` — Saved job bookmarks
20. `moderation` — User reports & content moderation queue

---

## 3. Technology Stack & Infrastructure

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS v4, TanStack Query v5, Lucide React
- **Backend API**: FastAPI 0.115, Python 3.11, Async SQLAlchemy 2.0, Alembic 1.14, Pydantic v2
- **Database**: PostgreSQL 16
- **Caching & Task Queue**: Redis 7, Celery 5 (Queues: `default`, `jobs`, `ai`, `matching`)
- **Object Storage**: MinIO (S3-compatible API)
- **Identity & IdP**: Keycloak 24.0 (OIDC support)
- **AI Gateway**: LiteLLM supporting Groq, Ollama (local models), OpenAI, Gemini, and custom LLMs

---

## 4. Architectural Rules & Principles

1. **Modular Monolith**: Maintain domain isolation inside a unified API repository without microservice overhead.
2. **Strict Layering**: Routers delegate all business logic, AI calls, and database operations to domain Services.
3. **Vendor Abstraction**: AI agents consume `AIService` (`LiteLLM`), auth consumes `AuthService`, storage consumes `S3Service`.
4. **Local-First & Offline Ready**: The entire platform runs locally via Docker Compose without mandatory cloud SaaS dependencies.
