# WorkMesh AI — Docker Verification

**Audit date:** 2026-08-08
**Method:** Build, startup, health checks, container inspection. All commands executed; results recorded exactly.

---

## 1. Compose File

**Path:** `infra/docker/docker-compose.yml`

Services defined: `postgres`, `redis`, `minio`, `minio-init`, `keycloak`, `api`, `web`, `celery-worker`, `celery-beat`.

Not defined (config exists but is not wired): prometheus, loki, traefik.

### Validation

```bash
docker compose -f infra/docker/docker-compose.yml config --quiet
# exit 0 — valid
```

## 2. Build Verification

```bash
docker compose -f infra/docker/docker-compose.yml build
# 4 images built successfully: api, web, celery-worker, celery-beat
```

## 3. Container Status (after `--force-recreate` of posture/redis/minio to fix stale network topology)

```
NAME                               STATUS
remote-ai-platform-api             Up 24 minutes (unhealthy)
remote-ai-platform-celery-beat     Up 21 minutes
remote-ai-platform-celery-worker   Up 21 minutes
remote-ai-platform-keycloak        Up 22 minutes (healthy)
remote-ai-platform-minio           Up 22 minutes (healthy)
remote-ai-platform-postgres        Up 22 minutes (healthy)
remote-ai-platform-redis           Up 22 minutes (healthy)
remote-ai-platform-web             Up 24 minutes
```

## 4. Service Details

| Service | Port | Healthcheck | Status | Notes |
|---|---|---|---|---|
| postgres | 5432 | pg_isready | healthy | 25 tables; alembic at 009 |
| redis | 6379 | redis-cli ping | healthy | |
| minio | 9000/9001 | curl health | healthy | buckets initialized by minio-init |
| keycloak | 8080 | curl health | healthy | realm `remote-ai-platform` imported (logs confirm `--import-realm`) |
| api | 8000 | curl /api/v1/health | **unhealthy** | **P0 import error** — see below |
| web | 3000 | none (http check) | running | HTTP 200 on `/` |
| celery-worker | — | none | ready | connected to redis broker (after network fix) |
| celery-beat | — | none | running | beat schedule loaded |

## 5. API Failure — Exact Error

```text
ImportError: cannot import name 'get_current_user' from 'app.core.security' (/app/app/core/security.py)

File "/app/app/main.py", line 40, in <module>
    from app.domains.groups.router import router as groups_router
File "/app/app/domains/groups/router.py", line 16, in <module>
    from app.core.security import get_current_user
```

Root cause: `groups/router.py` imports `get_current_user` from `app.core.security`. That function is defined in `app.domains.auth.dependencies` (every other router imports it correctly).

## 6. Environment Variables (compose)

- Set from `.env` (root). `.env.example` documents all required values with placeholders.
- Visible env names (not values): `DATABASE_URL`, `REDIS_URL`, `CELERY_BROKER_URL`, `MINIO_*`, `KEYCLOAK_*`, `JWT_SECRET_KEY`, `AI_PROVIDER`, `AI_MODEL`, `OLLAMA_*`, `GROQ_API_KEY`, `AI_API_KEY`, aggregator API URLs, feature flags.
- Safety note: `.env.example` contains **no real secrets**. No `.env` file found in repo tree.

## 7. Keycloak Verification

- Startup command includes `--import-realm` — confirmed in container inspect/logs.
- Realm file: `infra/keycloak/realm-remote-ai-platform.json`.
- Health endpoint returned success; login page reachable; containers show healthy.
- NOTE: The API does **not** use Keycloak for user verification currently (local JWT path is active).

## 8. Known Docker Issues

1. **API container is unhealthy** — P0 import error. Must be fixed before any E2E.
2. **Stale network topology** — the first `up` left postgres/redis without network attachment. `--force-recreate` fixed it (volumes preserved; init SQL not re-run). Recommend `docker compose down -v` for a truly clean bootstrap when acceptable.
3. **Monitoring/traefik** — configs present under `infra/` but not part of compose; not running.
4. **Web image** runs `next dev` for dev (start command). Production web would need `npm run build && next start` (build works).
5. Healthcheck only exists for api (points to broken route), postgres, redis, minio, keycloak. Web/celery lack healthchecks.

## 9. Volumes

- Named volumes are used for postgres (`postgres_data`), keycloak (`keycloak_data`), minio (`minio_data`), redis — runtime data lives **outside** the source tree. ✅ correct per cleanliness requirement.

## 10. Verdict

- Docker configuration: **PARTIALLY VERIFIED.**
- Builds: ✅ PASS (all 4 images).
- Infra services: ✅ PASS (postgres/redis/minio/keycloak healthy, celery worker/beat up).
- API: ❌ FAIL (P0 import crash).
- Web: ✅ PASS (serves HTTP 200, production build passes).