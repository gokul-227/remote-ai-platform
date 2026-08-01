# WorkMesh AI

> **AI-powered Remote Engineering Marketplace**
>
> Aggregate remote jobs from public APIs · Build AI-enhanced engineer profiles · Match talent with companies

---

## What is WorkMesh AI?

WorkMesh AI is an AI-powered remote engineering marketplace connecting companies with world-class remote engineers through transparent, explainable AI matching.

**Core MVP Capabilities:**
- 🎨 **Enterprise SaaS UI**: Built with Next.js 16 (App Router), TypeScript, Tailwind CSS, and Lucide icons.
- 💼 **Job Marketplace**: Aggregates remote engineering listings from 5 public sources (RemoteOK, Remotive, Arbeitnow, USAJobs, The Muse) with deduplication and filtering.
- 🧑‍💻 **Engineer Experience**: LinkedIn-style profiles, resume AI extraction, match score analytics, and AI skill improvement recommendations.
- 🏢 **Company Experience**: Talent discovery dashboard, candidate pipeline visualization, active role management, and AI matching insights.
- 🤖 **AI Layer**: LiteLLM-based provider abstraction supporting Gemini, Claude, OpenAI, and local Ollama models.
- 🔐 **Enterprise Auth & Infra**: Keycloak OIDC, PostgreSQL, MinIO S3 object storage, and Redis + Celery task queue.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (App Router) + TypeScript + Tailwind CSS |
| **Backend** | FastAPI + SQLAlchemy 2 + Alembic |
| **Database** | PostgreSQL 16 (FTS + pg_trgm) |
| **Cache / Task Queue** | Redis 7 + Celery 5 (Flower Monitoring UI) |
| **Object Storage** | MinIO (S3 Compatible) |
| **Authentication** | Keycloak OIDC (GitHub, Google, Email) |
| **AI Matching** | LiteLLM + Ollama / Gemini / Groq |
| **Deployment** | Vercel (Frontend), Render / Fly.io (Backend), Neon (Database) |

---

## Quickstart

### 1. Clone & Configure
```bash
git clone https://github.com/workmesh-ai/workmesh-ai.git
cd workmesh-ai
cp .env.example .env
```

### 2. Run Local Infrastructure
```bash
docker compose up -d
```

### 3. Seed Demo Data (50 Remote Jobs)
```bash
python3 scripts/seed_demo_jobs.py
# Or trigger via backend API:
curl -X POST "http://localhost:8000/api/v1/jobs/seed_demo"
```

### 4. Start Development Servers
```bash
# Terminal 1 — Backend API
cd apps/api && uvicorn app.main:app --reload

# Terminal 2 — Next.js Frontend
cd apps/web && npm run dev
```

---

## Access URLs

| Service | Access URL | Credentials / Notes |
|---|---|---|
| **Frontend Web App** | http://localhost:3000 | Next.js 16 Enterprise UI |
| **FastAPI Swagger Docs** | http://localhost:8000/docs | REST API specifications |
| **Keycloak Admin** | http://localhost:8080 | `admin` / `admin_dev_password` |
| **MinIO Console** | http://localhost:9001 | `minioadmin` / `minioadmin_dev_password` |
| **Celery Flower** | http://localhost:5555 | Task worker monitoring |

---

## Project Documentation

- 📜 [Deployment Guide](docs/deployment.md) — Steps for Vercel, Render, Neon Postgres, and AI keys.
- 🔧 [Local Services](docs/local-services.md) — Overview of MinIO, Celery Flower, Keycloak, and Redis setup.

---

## License

MIT © WorkMesh AI
