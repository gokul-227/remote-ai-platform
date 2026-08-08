# WorkMesh AI — Docker Infrastructure & Container Setup Guide

This document specifies the Docker architecture, container orchestration, environment variable configuration, volume persistence, and service health checks for the WorkMesh AI platform.

---

## 1. Container Architecture Overview

```
                          ┌───────────────────────────┐
                          │    Next.js 16 Web App     │
                          │   Container: `web` (3000) │
                          └─────────────┬─────────────┘
                                        │ HTTP / WebSockets
                                        ▼
                          ┌───────────────────────────┐
                          │     FastAPI 0.115 API     │
                          │   Container: `api` (8000) │
                          └──────┬──────────┬─────────┘
                                 │          │
                ┌────────────────┘          └────────────────┐
                ▼                                            ▼
         ┌──────────────┐                             ┌──────────────┐
         │ PostgreSQL16 │                             │   Redis 7    │
         │ (Port 5432)  │                             │ (Port 6379)  │
         └──────────────┘                             └──────┬───────┘
                                                             │
                                                             ▼
                                                      ┌──────────────┐
                                                      │ Celery Worker│
                                                      │ & Beat Engine│
                                                      └──────────────┘
```

The application uses **Docker Compose** to manage local dependencies:
- `api` — FastAPI application running on Python 3.11 with Uvicorn.
- `web` — Next.js 16 App Router application.
- `postgres` — PostgreSQL 16 relational database server.
- `redis` — Redis 7 in-memory cache and Celery broker.
- `minio` — S3-compatible object storage server for resumes and asset uploads.
- `keycloak` — Identity Provider for OIDC authentication.
- `celery-worker` — Background task execution for job aggregation and AI tasks.
- `celery-beat` — Periodic task scheduler for job provider synchronization.

---

## 2. Docker Compose Commands

### Start All Services
```bash
docker-compose -f infra/docker/docker-compose.yml up --build -d
```

### Check Container Health & Status
```bash
docker-compose -f infra/docker/docker-compose.yml ps
```

### Inspect Container Logs
```bash
# Backend logs
docker-compose -f infra/docker/docker-compose.yml logs --tail=100 api

# Frontend logs
docker-compose -f infra/docker/docker-compose.yml logs --tail=100 web

# Celery worker logs
docker-compose -f infra/docker/docker-compose.yml logs --tail=100 celery-worker
```

### Execute Database Migrations inside API Container
```bash
docker-compose -f infra/docker/docker-compose.yml exec api alembic upgrade head
```

### Seed Development Demo Data
```bash
docker-compose -f infra/docker/docker-compose.yml exec api python -m app.scripts.seed_data
```

### Execute Backend Test Suite
```bash
docker-compose -f infra/docker/docker-compose.yml exec api pytest tests/ -v
```

---

## 3. Persistent Docker Volumes

All application state is persisted using named Docker volumes defined in `infra/docker/docker-compose.yml`:
- `postgres_data` — PostgreSQL 16 database files.
- `redis_data` — Redis persistence files.
- `minio_data` — Uploaded resumes, avatars, and asset deliverables.

No local database files or runtime uploads are stored inside git source control.
