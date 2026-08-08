# WorkMesh AI — Agent Work Protocol

Every AI agent that works on this repository **MUST** follow this protocol.

---

## Mandatory Lifecycle

```
READ → AUDIT → UNDERSTAND → PLAN → IMPLEMENT → TEST → FIX → DOCUMENT → HANDOFF
```

Never skip directly to IMPLEMENT.
Never START FROM SCRATCH.

---

## Step 1: READ (Before Any Code)

Open and read these files in order:
1. `CLAUDE.md` — engineering conventions, command reference, architecture overview
2. `docs/CURRENT_STATE.md` — domain gap matrix, known bugs, route inventory
3. `docs/HANDOFF.md` — what the previous agent did, what comes next
4. `docs/DECISIONS.md` — important architectural decisions already made
5. `README.md` — overall project description

---

## Step 2: AUDIT (Before Any Code)

Run these commands and inspect the output:
```bash
git status
git log --oneline -10
git diff HEAD~1 --name-only   # what changed in last commit
```

Then inspect the specific domain you'll be working on:
- Read the actual source files
- Compare documentation claims vs. actual code
- Do NOT trust any document that says "DONE" without verifying the code

---

## Step 3: UNDERSTAND

Map what already exists for your task:
- Which models exist in the database?
- Which API routes exist?
- Which frontend pages exist?
- Which tests exist?

If you find discrepancies between docs and code, trust the CODE.

---

## Step 4: PLAN

For any non-trivial change:
1. Identify what needs to change: DB schema, backend, API, frontend, tests
2. Identify risks: breaking changes, existing tests, data migrations
3. Write a brief plan in your response before starting
4. Identify the migration number if you're adding to the schema

---

## Step 5: IMPLEMENT

Follow the domain pattern established by mature domains (`auth`, `engineers`, `jobs`, `matching`):
```
domains/<name>/
  models.py       — SQLAlchemy models
  schemas.py      — Pydantic schemas
  repository.py   — DB access layer
  service.py      — business logic
  router.py       — FastAPI APIRouter
```

Rules:
- Wire new routers into `apps/api/app/main.py`
- New migrations must be numbered `019_*`, `020_*`, etc. (sequentially)
- Do NOT inline schemas in `router.py` — put them in `schemas.py`
- Do NOT use floating point for money amounts
- Do NOT hard-code provider names in business logic
- Do NOT expose secrets in frontend code

---

## Step 6: TEST

Before claiming something is done:
1. Run `pytest` (via Docker: `docker compose exec api pytest`)
2. Add tests for new functionality
3. Verify the build passes: `npm run build` (via Docker: `docker compose exec web npm run build`)
4. Test the API manually via `http://localhost:8000/docs`

---

## Step 7: FIX

If tests fail:
1. Read the error carefully
2. Fix the root cause, not just the symptom
3. Record the bug in `docs/HANDOFF.md` if it's a systemic issue

---

## Step 8: DOCUMENT

Update these files:
- `docs/CURRENT_STATE.md` — update the domain's status to COMPLETE/PARTIAL
- `docs/HANDOFF.md` — update with what you did and what comes next
- `docs/DECISIONS.md` — record any architectural decisions

---

## Step 9: HANDOFF

Update `docs/HANDOFF.md` with:
- What you completed
- Files you changed
- Tests you ran
- Known issues you found
- What the NEXT agent should do

---

## Rules You Must Never Break

| Rule | Reason |
|---|---|
| Never delete working functionality | Preserving user's investment |
| Never use floating point for money | Financial accuracy |
| Never hard-code AI provider | Vendor independence |
| Never expose secrets to frontend | Security |
| Never skip database migrations | Schema consistency |
| Never trust docs — verify the code | Docs are often stale |
| Never claim done without testing | Quality |
| Always update HANDOFF.md | Agent continuity |

---

## Repository Structure Reference

```
remote-ai-platform/
├── apps/
│   ├── api/                    # FastAPI backend (Python 3.11)
│   │   ├── app/
│   │   │   ├── domains/        # Bounded contexts (auth, engineers, jobs, etc.)
│   │   │   ├── agents/         # LLM agents (resume_parser, job_enricher)
│   │   │   ├── core/           # Cross-cutting concerns
│   │   │   ├── services/       # Shared services (ai, notifications, payments)
│   │   │   └── workers/        # Celery tasks
│   │   └── alembic/versions/   # Database migrations (001–018)
│   └── web/                    # Next.js 16 / React 19 frontend
│       └── src/
│           ├── app/            # Next.js App Router pages
│           ├── components/     # Shared components
│           ├── hooks/          # TanStack Query hooks
│           └── lib/            # api.ts, auth.tsx
├── infra/
│   └── docker/
│       └── docker-compose.yml  # SINGLE source of truth for local infra
└── docs/                       # Architecture and handoff documents
```

---

## Docker Commands

```bash
# Start everything
docker compose -f infra/docker/docker-compose.yml up -d

# View logs
docker compose -f infra/docker/docker-compose.yml logs -f api

# Run backend tests
docker compose -f infra/docker/docker-compose.yml exec api pytest

# Run migrations
docker compose -f infra/docker/docker-compose.yml exec api alembic upgrade head

# Frontend dev
docker compose -f infra/docker/docker-compose.yml exec web npm run dev

# Or from repo root (npm scripts)
npm run docker:up
npm run docker:logs
npm run docker:down
```

---

## Key URLs (when Docker is running)

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| Keycloak | http://localhost:8080 |
| MinIO Console | http://localhost:9001 |
| Prometheus metrics | http://localhost:8000/metrics |

---

## Current Next Task

See `docs/HANDOFF.md` → "Next Recommended Task"
