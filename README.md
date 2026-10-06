# Remote AI Platform

[![CI](https://github.com/gokul-227/remote-ai-platform/actions/workflows/ci.yml/badge.svg?branch=prod)](https://github.com/gokul-227/remote-ai-platform/actions/workflows/ci.yml)
[![CodeQL](https://github.com/gokul-227/remote-ai-platform/actions/workflows/codeql.yml/badge.svg?branch=prod)](https://github.com/gokul-227/remote-ai-platform/actions/workflows/codeql.yml)
[![Production canary](https://github.com/gokul-227/remote-ai-platform/actions/workflows/production-canary.yml/badge.svg)](https://github.com/gokul-227/remote-ai-platform/actions/workflows/production-canary.yml)
![License: proprietary](https://img.shields.io/badge/license-proprietary-red)

A remote-work marketplace for professionals and organisations: discover remote jobs, build a profile
(optionally from a resume, with AI help), apply, get matched with explainable scores, message, and run
contracted work — all on free-tier infrastructure.

Live: <https://remoteaiplatform.com> · Contact: <contact@remoteaiplatform.com>

## Architecture

![Remote AI Platform architecture](docs/architecture/architecture.png)

[Open the editable draw.io diagram](docs/architecture/architecture.drawio) · machine-readable model:
[`architecture.yaml`](docs/architecture/architecture.yaml) (every component lists the files that prove it exists)

### Product architecture

Every feature end to end — who uses it, its screens, the API behind it and the services it relies on — read
from the web app's routes, the API's routers and the user roles:

![Remote AI Platform product architecture](docs/architecture/product.png)

[Open the editable draw.io diagram](docs/architecture/product.drawio) · model: [`product.yaml`](docs/architecture/product.yaml)

- **apps/web** — Next.js 16 / React 19. The product UI is a client-rendered, hash-routed app in
  `src/figma/*` (derived from the Figma design) inside a thin Next.js shell. Resource URLs are shareable
  (`/#jobdetail/<id>`, `/#engineer/<id>`, …). Public job pages are server-rendered at `/jobs/<id>` (title,
  canonical, Open Graph), with a sitemap and real 404s; only production is indexable.
- **apps/api** — FastAPI modular monolith (`app/domains/*`: auth, engineers, companies, jobs, applications,
  matching, network/messaging, social, groups, projects, contracts, payments, trust, moderation, admin …).
  Async SQLAlchemy 2 + Alembic.
- **No background worker.** Resume parsing runs inline with a time budget; job sync is a scheduled workflow.
  Imported jobs unseen by the sync for 30 days leave the public list. Messaging and notifications poll;
  the WebSocket endpoints stay off (`FEATURE_REALTIME_WEBSOCKETS`).
- **Secrets** live in Infisical and reach Render through an Infisical Secret Sync; never commit or paste them.
- **Backups:** `ops/backup/` (encrypted dump + storage copy, self-verifying restore).
- **Payments are switched off** (`MARKETPLACE_PAYMENTS_ENABLED=false`): nothing is charged or held. Freelance
  work is paid directly between client and professional.

## Generated documentation

The architecture diagram, the OpenAPI document and the Postman collection are generated from the code
and checked in CI; **do not edit them by hand**.

```text
Code / infrastructure → tools/architecture (catalog rules) → architecture.yaml → .drawio → .png
FastAPI app           → docs/api/openapi.yaml → Postman Collection v3 (YAML) in postman/collections/
```

```bash
make docs-sync      # regenerate everything (needs apps/api/.venv and Node 22+)
make docs-check     # what CI runs: fail if anything is stale
make architecture-sync / make api-sync / make docs-test
```

- **Architecture**: components come only from repository evidence (manifests, Settings, routers, aggregators,
  deploy config, workflows). Evidence the rules don't recognise — a new dependency, AI provider, job board
  or external-service setting — fails the sync until it is classified in `tools/architecture/catalog.yaml`.
  The PNG needs draw.io desktop or Docker; otherwise the PR workflow renders it.
- **Postman**: built with Postman's own converter and CLI, validated with `postman collection lint`, an OpenAPI
  coverage check and an environment check, and run in full against the mock and a live API in CI.
- **CI**: on every PR, `architecture-sync.yml` and `postman-sync.yml` regenerate, commit any update to the PR
  branch as `docs-sync[bot]` and re-run the checks on it (fork PRs fail with the drift and the regenerated files
  attached instead). Each also keeps one PR comment up to date with what the PR changes: components and
  connections with before/after diagrams, and endpoints added, removed or changed with the Postman requests
  affected. Pushes to `dev`/`prod` only check. After a merge to `prod` the Postman workspace is mirrored from the
  repository (`POSTMAN_API_KEY` secret + `POSTMAN_WORKSPACE_ID` variable).

## Use the API from Postman

GitHub is the source of truth: everything in `postman/` is generated from the API (or hand-written in
`postman/overrides/` and `postman/environments/`) and travels with every clone. Change those, never a cloud
copy — CI flags hand edits to generated files as drift, and edits made only in a Postman workspace are
overwritten by the next mirror.

| Folder | What it is |
| --- | --- |
| `collections/Remote AI Platform` | every endpoint, with documentation, variables, auth, params, body and tests |
| `environments/` | `local`, `dev`, `prod` — tokens are never committed |
| `globals/` | the id variables requests pass to each other |
| `specs/` | the OpenAPI document the collection is generated from |
| `mocks/` | a mock server generated from the spec (`postman mock run postman/mocks/remote-ai-platform/config.yaml`) |
| `documents/` | workspace docs: README, API reference, request dependencies, testing |
| `flows/` | Postman Flows for the main journeys (health check, professional applies, organisation hires); blocks point at request files by path, so they work in any clone |
| `overrides/` | hand-written: extra tests and guards per request, and the *Sign in* folder |

**Open it:** Postman 12+ → **Files** → **Open folder** → this repository, then pick an environment:

- `local` — `make postman-stack` runs the API on :8000 with a local sign-in service (code always `123456`);
  requests sign in by themselves.
- `dev` — set `email`, `supabase_url`, `supabase_publishable_key` (from Infisical / your `.env`) as current
  values, then run **Sign in**.
- `prod` — the same, but read-only: requests that change data are skipped (`allow_writes` is `false`).

Every request documents what it needs, which earlier request provides it, and what it tests. Ids are passed
along automatically, tokens refresh themselves, and session-ending requests only run when
`allow_destructive` is `true`.

**Test from a terminal** (Postman CLI — what CI runs on every API change):

```bash
make postman-test-mock                      # whole collection against the generated mock, no Docker
make postman-stack && make postman-test     # whole collection against the real API (ENV=dev|prod also work)
make postman-stack-down
```

To work in a cloud workspace instead, mirror the repo into one dedicated to it:
`POSTMAN_API_KEY=… POSTMAN_WORKSPACE_ID=… make postman-push` (or set those as a repository secret and variable
and CI mirrors `prod` after every change and daily).

## Local development

Prerequisites: Node 22+, Python 3.11, Docker. Sign-in needs a Supabase project (use the dev project).

```bash
cp .env.example .env            # fill SUPABASE_URL / NEXT_PUBLIC_SUPABASE_* with the dev project
npm ci
docker compose -f infra/docker/docker-compose.yml up -d postgres redis minio minio-init

cd apps/api && python3.11 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload          # API on :8000

cd apps/web && npm run dev                        # web on :3000
```

AI features need at least one free-tier key (`GROQ_API_KEY` recommended); without one they report
"unavailable" and everything else works.

## Tests

```bash
cd apps/api && .venv/bin/pytest && .venv/bin/ruff check . && .venv/bin/mypy app
cd apps/web && npm run lint && npx tsc --noEmit && npm test
```

End-to-end journeys run against an isolated stack and a mock Supabase Auth (no real accounts or email):

```bash
python3 tests/e2e/mock-supabase/server.py &        # needs pyjwt[crypto]; ISSUER=http://host.docker.internal:9999/auth/v1
docker compose -p rap-e2e -f infra/docker/docker-compose.yml -f tests/e2e/docker-compose.e2e.yml \
  up -d --build postgres redis minio minio-init api web
cd tests/e2e && npx playwright test                # web :13000, API :18000
```

## Deployment

`prod` and `dev` branches deploy automatically after CI passes: the frontend to Cloudflare Workers, the
backend to Render via a deploy hook pinned to the tested commit. Both report the deployed commit at
`/api/version` (web) and `/health/version` (API), and the workflow waits for both to match. Migrations run
on API start. Secrets live in Infisical and the providers' dashboards — never in this repository.

More detail (architecture, operations, runbooks) is in the private companion repository.

## License

Proprietary. Copyright (c) 2026 Gokul. All rights reserved. The code is publicly visible but may not be used,
copied or deployed without written permission; see [LICENSE](LICENSE). Security reports: [SECURITY.md](SECURITY.md).
