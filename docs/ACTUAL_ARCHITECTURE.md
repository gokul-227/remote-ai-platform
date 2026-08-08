# WorkMesh AI — Actual System Architecture

> **Document Type**: Production System Architecture Specification  
> **Last Verified**: 2026-08-08  
> **Repository**: `remote-ai-platform` (`main` branch)

---

## 1. Actual System Topology

```
                BROWSER (Next.js 16 App Router UI)
                         │
        ┌────────────────┴────────────────┐
        │ HTTP REST APIs & WebSockets     │
        ▼                                 ▼
┌───────────────────────┐     ┌───────────────────────┐
│  FastAPI API Server   │     │  WebSocket Gateway    │
│  (Port 8000)          │     │  (WS /messages/ws)    │
└───────────┬───────────┘     └───────────┬───────────┘
            │                             │
    ┌───────┴───────┬──────────────┬──────┴────────┐
    ▼               ▼              ▼               ▼
┌───────────┐ ┌───────────┐ ┌─────────────┐ ┌─────────────┐
│PostgreSQL │ │ Redis 7   │ │ MinIO (S3)  │ │ LiteLLM AI  │
│(Port 5432)│ │(Port 6379)│ │ (Port 9000) │ │ Gateway     │
└───────────┘ └─────┬─────┘ └─────────────┘ └─────────────┘
                    │
                    ▼
          ┌──────────────────┐
          │ Celery Worker &  │
          │ Celery Beat Engine│
          └──────────────────┘
```

---

## 2. Verified Communication & Execution Paths

### Path A: User Interactive Request Flow
```
User Action (Browser)
  → Next.js 16 Web Component (apps/web/src/app)
  → TanStack Query Hook (apps/web/src/hooks)
  → Axios API Client (apps/web/src/lib/api.ts)
  → FastAPI Endpoint Handler (apps/api/app/domains/[domain]/router.py)
  → Dependency Injection (get_current_user / require_role / get_db)
  → Domain Service Layer (apps/api/app/domains/[domain]/service.py)
  → Async SQLAlchemy 2.0 ORM Query
  → PostgreSQL Database Server (Port 5432)
```

### Path B: Real-Time Messaging WebSocket Flow
```
Client Browser
  → WebSocket Connection (`WS /api/v1/messages/ws/{conv_id}?token=...`)
  → JWT Authentication Handshake
  → Message Dispatch Handler
  → PostgreSQL Async Persistence (messages table)
  → Broadcast to Connected Conversation Participants
```

### Path C: Background Job Ingestion & Scheduler Flow
```
Celery Beat Scheduler (Periodic 6-hour cron trigger)
  → Celery Worker Queue (Redis Broker on Port 6379)
  → Provider Adapters (RemoteOK, Remotive, Arbeitnow, USAJobs, The Muse)
  → Provider API Fetch & Response Normalization
  → Deduplication & Skill Tagging Filter
  → PostgreSQL Job Post Insertion & Full-Text Search Indexing
```

### Path D: AI Agent Execution Flow
```
API Endpoint / Service Action
  → AIService (`apps/api/app/services/ai/`)
  → LiteLLM Multi-Provider Gateway (`apps/api/app/core/llm.py`)
  → Configured Provider (Ollama / Groq / OpenAI / Gemini)
  → Structured Pydantic Schema Validation
  → Domain Logic Integration & Fallback Handling
```

---

## 3. Technology Stack Inventory

| Component | Technology | Version | Purpose |
|---|---|---|---|
| **Frontend Framework** | Next.js App Router | 16.2.11 | UI, routing, server/client components |
| **UI Library** | React | 19.2.4 | Dynamic view components |
| **Styling System** | Tailwind CSS | v4 | Utility-first CSS styling system |
| **State Management** | TanStack Query | v5 | Server state caching & mutation synchronization |
| **Backend Framework** | FastAPI | 0.115.5 | High-performance async REST & WebSocket API |
| **Language Runtime** | Python | 3.11 (Docker) | Backend execution runtime |
| **ORM / Database Engine**| Async SQLAlchemy | 2.0.36 | Database abstraction & queries |
| **Database Migrations** | Alembic | 1.14.0 | Schema migration management |
| **Relational Database** | PostgreSQL | 16 | Persistent relational storage |
| **Cache & Message Broker**| Redis | 7 | Caching & Celery task queue broker |
| **Background Task Worker**| Celery | 5.4.0 | Asynchronous job aggregation & background tasks |
| **Object Storage** | MinIO | latest | S3-compatible file storage for uploads |
| **Identity & IdP** | Keycloak | 24.0 | OpenID Connect (OIDC) identity provider |
| **AI Gateway** | LiteLLM | 1.55.2 | Multi-provider vendor-neutral AI abstraction |
