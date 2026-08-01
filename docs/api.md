# API Reference

Full interactive documentation (generated from the FastAPI schema, always up to date) is served at
**`/docs`** (Swagger UI) and **`/redoc`** when the backend is running — e.g. http://localhost:8000/docs.
This page is a map of the domains and auth model; treat `/docs` as the source of truth for exact request/
response shapes.

All routes are prefixed with `/api/v1`. Auth is a JWT bearer token (`Authorization: Bearer <token>`)
issued by `POST /auth/login` or `/auth/register`.

## Domains

| Prefix | Purpose | Auth |
|---|---|---|
| `/auth` | Register, login, refresh, logout, role switch (`ENGINEER`/`COMPANY` only) | Mixed — see below |
| `/engineers` | Engineer profile CRUD, resume upload, AI enhancement, public search | `ENGINEER`/`ADMIN` for writes; reads public |
| `/companies` | Company profile CRUD, public directory | `COMPANY`/`ADMIN` for writes; reads public |
| `/jobs` | Job search, job detail, job creation, aggregator sync trigger, demo seed | `COMPANY`/`ADMIN` to create; `/sync` is admin-only; `/seed_demo` disabled in production |
| `/search` | Combined job + engineer search | Public |
| `/matching` | AI-recommended jobs for an engineer, candidate ranking for a company's job, match status updates | Ownership-checked (see below) |
| `/admin` | Platform stats, user management, job-source sync logs | `ADMIN` only |
| `/applications` | Apply to a job, withdraw, list own/company applications | `ENGINEER` to apply; `COMPANY`/`ADMIN` to list company-side |
| `/saved_jobs` | Bookmark/unbookmark jobs | Authenticated |
| `/network` | Connections + messaging (conversations, messages, websocket) | Authenticated |
| `/projects` | Project workspace: milestones, tasks, comments, AI planning/progress/risk reports | Membership-checked (`require_project_access`) |
| `/notifications` | User notification feed | Authenticated |

## Auth flows

- **Email/password** (primary path exercised by the frontend): `POST /auth/register` → `POST
  /auth/login` → self-signed JWT (HS256, `JWT_SECRET_KEY`). `POST /auth/refresh` rotates the access
  token from a refresh token.
- **Keycloak OIDC**: `GET /auth/login-url` / `/auth/logout-url` return Keycloak redirect URLs; `POST
  /auth/sync` upserts a user from Keycloak claims. Provisioned in the Docker stack but not the primary
  flow the current UI drives.
- `verify_token` requires a valid signature — there is no fallback to unverified claims.

## Authorization notes worth knowing before integrating

- `PATCH /auth/role` lets a user switch between `ENGINEER` and `COMPANY` but rejects self-assigning
  `ADMIN`.
- `POST /jobs` requires `COMPANY`/`ADMIN`; for a `COMPANY` caller, `company_id`/`company_name` are
  derived server-side from the caller's own `CompanyProfile` — you do not need to (and for company
  callers, should not) pass `company_id` yourself.
- `GET /matching/candidates/{job_id}` is ownership-checked: a `COMPANY` caller can only view candidates
  for jobs their own company posted.
- `PATCH /matching/{match_id}/status` is ownership-checked against the calling engineer.
- `POST /jobs/sync` is admin-only (the same sync also runs automatically every 6 hours via Celery beat).
- `POST /jobs/seed_demo` returns `403` when `APP_ENV=production` — it's a local/demo convenience only.

## Example: register → login → create profile

```bash
BASE=http://localhost:8000/api/v1

curl -X POST $BASE/auth/register -H "Content-Type: application/json" -d '{
  "email": "jane@example.com", "password": "hunter2-plus", "full_name": "Jane Doe", "role": "ENGINEER"
}'
# -> { "access_token": "...", "refresh_token": "...", "user": {...} }

TOKEN=<access_token from above>

curl -X POST $BASE/engineers/me -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{
  "headline": "Senior Backend Engineer", "years_of_experience": 5, "skills": ["Python", "FastAPI"]
}'
```

See [development.md](development.md) for running the stack locally and [deployment.md](deployment.md)
for production environment variables.
