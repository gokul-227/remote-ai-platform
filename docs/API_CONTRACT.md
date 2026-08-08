# WorkMesh AI — API Design & Envelopes

All HTTP API endpoints reside under `/api/v1/`.

## 1. Global Response Envelope
Standard success responses wrap payloads consistently:
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional descriptive status message"
}
```

Paginated collections use standard pagination parameters:
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total_items": 142,
    "total_pages": 8
  }
}
```

## 2. Standard Error Response
Errors use standard HTTP status codes (400, 401, 403, 404, 409, 422, 500) and structured payload:
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Job with ID '123' does not exist.",
    "details": []
  }
}
```

## 3. Core Endpoint Groups
- `POST /api/v1/auth/register` — Create account.
- `POST /api/v1/auth/login` — Authenticate and return JWT token pair.
- `POST /api/v1/auth/refresh` — Refresh access token.
- `GET /api/v1/engineers/me` — Current engineer profile details.
- `PUT /api/v1/engineers/me` — Update engineer profile.
- `POST /api/v1/engineers/resume` — Upload resume file & trigger AI skill extraction.
- `GET /api/v1/jobs` — Query aggregated remote jobs (supports filters: `q`, `skills`, `country`, `page`, `limit`).
- `GET /api/v1/jobs/{id}` — Single job detail view.
- `GET /api/v1/matching/jobs/{job_id}` — Get explainable match score between current user and target job.
- `GET /api/v1/network/feed` — Get professional feed posts.
- `POST /api/v1/network/connections/request` — Send connection request.
- `GET /api/v1/messages/conversations` — List active conversations.
- `WS /api/v1/messages/ws` — WebSocket real-time chat gateway.
- `POST /api/v1/projects` — Create project.
- `POST /api/v1/projects/{id}/ai_plan` — Generate AI project plan.
- `GET /api/v1/admin/stats` — Admin dashboard summary.
