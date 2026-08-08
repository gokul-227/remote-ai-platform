# WorkMesh AI — API Design & Complete Contract Specification

All HTTP API endpoints reside under the `/api/v1/` prefix.

---

## 1. Global Response Envelopes

### Success Envelope
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional descriptive status message"
}
```

### Paginated Collection Envelope
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

### Error Response Envelope
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid parameter provided.",
    "details": []
  }
}
```

---

## 2. Complete API Endpoint Directory

### Authentication (`/api/v1/auth`)
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Register a new user (`ENGINEER`, `COMPANY`, `ADMIN`) | Public |
| `POST` | `/api/v1/auth/login` | Authenticate with credentials and receive JWT access token | Public |
| `POST` | `/api/v1/auth/refresh` | Obtain a new access token using refresh token | Public |
| `POST` | `/api/v1/auth/logout` | Invalidate active session tokens | JWT |
| `GET` | `/api/v1/auth/me` | Fetch authenticated user profile and roles | JWT |
| `PATCH` | `/api/v1/auth/role` | Switch active role context | JWT |

### Engineer Profiles (`/api/v1/engineers`)
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/engineers` | Search and list engineer profiles | Public |
| `GET` | `/api/v1/engineers/me` | Fetch active engineer profile | JWT |
| `PUT` | `/api/v1/engineers/me` | Update bio, skills, location, hourly rate | JWT |
| `POST` | `/api/v1/engineers/resume` | Upload resume PDF/Doc to MinIO & trigger AI parser | JWT |
| `GET` | `/api/v1/engineers/{id}` | Public engineer profile view | Public |

### Company Profiles (`/api/v1/companies`)
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/companies` | List registered companies | Public |
| `GET` | `/api/v1/companies/me` | Fetch active company profile | JWT (Company) |
| `PUT` | `/api/v1/companies/me` | Update company description, tech stack, website | JWT (Company) |
| `GET` | `/api/v1/companies/{id}` | View company public details and posted jobs | Public |

### Job Aggregation & Postings (`/api/v1/jobs`)
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/jobs` | Multi-faceted search across aggregated jobs | Public |
| `GET` | `/api/v1/jobs/{id}` | Detailed job post description & company metadata | Public |
| `POST` | `/api/v1/jobs` | Create a direct job post | JWT (Company) |
| `POST` | `/api/v1/jobs/sync` | Trigger Celery job sync from RemoteOK, Remotive, etc. | Admin / Cron |
| `POST` | `/api/v1/jobs/seed_demo` | Seed database with initial demo jobs | Admin |

### AI Matching Engine (`/api/v1/matching`)
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/matching/recommendations` | Get personalized AI-recommended jobs with per-factor scores | JWT (Engineer) |
| `GET` | `/api/v1/matching/candidates/{job_id}` | Get top matched candidates for a company job | JWT (Company) |
| `PATCH` | `/api/v1/matching/{match_id}/status` | Update match state (`saved`, `applied`, `dismissed`) | JWT |

### Applications (`/api/v1/applications`)
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/v1/applications` | Submit application to a job post | JWT (Engineer) |
| `GET` | `/api/v1/applications/me` | List applications submitted by engineer | JWT (Engineer) |
| `GET` | `/api/v1/applications/company` | List applications received by company | JWT (Company) |
| `PATCH` | `/api/v1/applications/{id}/status` | Update application state (`SHORTLISTED`, `ACCEPTED`, `REJECTED`) | JWT (Company) |

### Professional Network & Connections (`/api/v1/connections`)
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/connections` | List user connections and pending requests | JWT |
| `POST` | `/api/v1/connections` | Send connection request to user | JWT |
| `PATCH` | `/api/v1/connections/{id}` | Accept, decline, or block connection request | JWT |

### Messaging & WebSockets (`/api/v1/conversations`, `/api/v1/messages`)
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/conversations` | List user conversations | JWT |
| `POST` | `/api/v1/conversations` | Start new conversation with user | JWT |
| `GET` | `/api/v1/conversations/{id}/messages` | Fetch chat message history | JWT |
| `POST` | `/api/v1/conversations/{id}/messages` | Send HTTP message fallback | JWT |
| `WS` | `/api/v1/messages/ws/{conv_id}` | WebSocket real-time chat connection | Token Query Param |

### Projects & AI Planner (`/api/v1/projects`)
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/projects` | List active user projects | JWT |
| `POST` | `/api/v1/projects` | Create new delivery project brief | JWT |
| `GET` | `/api/v1/projects/{id}` | Project detail view with milestones, tasks, submissions | JWT |
| `POST` | `/api/v1/projects/{id}/plan` | Trigger AI agent to generate project plan & milestones | JWT |
| `POST` | `/api/v1/projects/{id}/approve-plan` | Approve generated plan and transition to ACTIVE | JWT |
| `PATCH` | `/api/v1/projects/tasks/{task_id}` | Update task status (`TODO`, `IN_PROGRESS`, `DONE`) | JWT |
| `POST` | `/api/v1/projects/tasks/{task_id}/offers` | Dispatch task offer to engineer candidate | JWT (Company) |
| `POST` | `/api/v1/projects/tasks/{task_id}/submissions` | Submit work deliverable for review | JWT (Engineer) |
| `PATCH` | `/api/v1/projects/submissions/{sub_id}/review` | Approve deliverable or request changes | JWT (Company) |
| `POST` | `/api/v1/projects/submissions/{sub_id}/ai-review` | Trigger AI Quality Engine review of submission | JWT |

### Digital Contracts (`/api/v1/contracts`)
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/contracts` | List active and signed contracts | JWT |
| `POST` | `/api/v1/contracts` | Draft new contract for project / engagement | JWT |
| `GET` | `/api/v1/contracts/{id}` | Contract details, milestones, and signatures | JWT |
| `POST` | `/api/v1/contracts/{id}/sign` | Digitally sign contract | JWT |

### Trust & Reputation Engine (`/api/v1/trust`)
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/trust/{user_id}` | Fetch verified trust score and component scores | Public |
| `POST` | `/api/v1/trust/recalculate` | Trigger trust score recalculation engine | JWT (Admin) |

### Financial Ledger & Escrow Payments (`/api/v1/payments`)
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/payments/wallet` | Fetch wallet balance, escrow balance, transactions | JWT |
| `POST` | `/api/v1/payments/deposit` | Add sandbox funds to wallet | JWT |
| `POST` | `/api/v1/payments/escrow` | Fund milestone escrow | JWT (Company) |
| `POST` | `/api/v1/payments/release` | Release escrow funds to engineer wallet | JWT (Company) |

### Groups & Communities (`/api/v1/groups`)
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/groups` | List and search developer groups | Public |
| `POST` | `/api/v1/groups` | Create new developer group | JWT |
| `GET` | `/api/v1/groups/{id}` | Group details, member list, and post feed | Public |
| `POST` | `/api/v1/groups/{id}/join` | Join group | JWT |
| `POST` | `/api/v1/groups/{id}/leave` | Leave group | JWT |
| `POST` | `/api/v1/groups/{id}/posts` | Create post in group | JWT (Member) |

### AI Quality Engine (`/api/v1/quality`)
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/v1/quality/evaluate` | AI assessment of work submission against requirements | JWT |
| `POST` | `/api/v1/quality/review-code` | AI line-by-line code review with security check | JWT |
| `POST` | `/api/v1/quality/batch-evaluate` | Concurrent evaluation of multiple deliverables | JWT |
| `GET` | `/api/v1/quality/health` | Check quality engine LLM service health | Public |

### Admin Console (`/api/v1/admin`)
| Method | Route | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/v1/admin/stats` | Aggregated platform metrics and job sources breakdown | JWT (Admin) |
| `GET` | `/api/v1/admin/users` | List platform users with status toggle | JWT (Admin) |
| `PATCH` | `/api/v1/admin/users/{id}/status` | Activate or suspend user account | JWT (Admin) |
| `GET` | `/api/v1/admin/sync-logs` | Job aggregator sync logs history | JWT (Admin) |
| `GET` | `/api/v1/admin/ai-usage` | Token usage, cost estimates, and model breakdown | JWT (Admin) |
| `GET` | `/api/v1/admin/health/details` | Detailed subsystem latencies and health status | JWT (Admin) |
