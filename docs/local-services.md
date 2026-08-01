# WorkMesh AI — Local Services & Infrastructure Architecture

This document describes the local infrastructure services supporting the WorkMesh AI platform, their roles, access endpoints, and management instructions.

---

## Service Overview & Endpoints

| Service | Technology | Port | Access URL / Interface | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend Web App** | Next.js 16 (App Router) | `3000` | [http://localhost:3000](http://localhost:3000) | Enterprise SaaS web application for engineers & companies |
| **Backend API** | FastAPI (Python 3.11) | `8000` | [http://localhost:8000/docs](http://localhost:8000/docs) | REST API endpoints, matching logic, and job aggregation |
| **Database** | PostgreSQL 16 | `5432` | `postgresql://workmesh:workmesh_secret@localhost:5432/workmesh_db` | Primary relational store (Users, Engineers, Companies, Jobs) |
| **Identity / Auth** | Keycloak OIDC | `8080` | [http://localhost:8080](http://localhost:8080) | OpenID Connect identity provider & SSO management |
| **Object Storage** | MinIO (S3 Compatible) | `9000` / `9001` | [http://localhost:9001](http://localhost:9001) | S3-compatible file storage (Resumes, profile assets, logos) |
| **Task Queue** | Redis + Celery | `6379` / `5555` | [http://localhost:5555](http://localhost:5555) | Celery worker task execution & Flower monitoring UI |

---

## Detailed Service Descriptions

### 1. MinIO Object Storage (`http://localhost:9001`)
MinIO provides S3-compatible cloud storage for all binary assets:
- **`resumes` bucket:** Stores candidate PDF and DOCX resume uploads.
- **`profile-assets` bucket:** Stores profile avatars, company logos, and portfolio attachments.
- **Console Credentials:** Default admin credentials are set in `.env` (`MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`).

### 2. Celery & Flower Monitoring (`http://localhost:5555`)
Background asynchronous processing is managed by Celery with Redis as the broker:
- **Job Aggregation Workers:** Sync jobs from public APIs (RemoteOK, Remotive, Arbeitnow, USAJobs, The Muse) every 6 hours.
- **AI Parsing Tasks:** Extract technical skills and professional summaries from uploaded PDF resumes in the background.
- **Flower Console:** Real-time web UI to monitor active workers, task status, execution latency, and retry failed jobs.

### 3. Keycloak OIDC Authentication (`http://localhost:8080`)
Identity management and role-based access control:
- **Realm:** `workmesh`
- **Client:** `workmesh-api` / `workmesh-web`
- **Roles:** `ENGINEER`, `COMPANY`, `ADMIN`
- Supports OIDC access tokens, Google SSO, and GitHub SSO integration.

---

## Operations & Commands

### Seed Demo Data
To populate 50 realistic software engineering remote jobs into the database:
```bash
curl -X POST "http://localhost:8000/api/v1/jobs/seed_demo"
```
Or via script:
```bash
python3 scripts/seed_demo_jobs.py
```

### Celery Worker Logs
```bash
docker compose logs -f celery_worker
```

### Database Migrations (Alembic)
```bash
cd apps/api
alembic upgrade head
```
