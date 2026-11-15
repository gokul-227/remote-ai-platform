# End-to-end tests

Playwright journeys in `tests/e2e` run against an isolated compose stack (project `rap-e2e`, web
`:13000`, API `:18000`) with mock identity providers. No real accounts, email or provider calls.

```bash
# Supabase-compatible mock (legacy path)
python3 tests/e2e/mock-supabase/server.py &        # needs pyjwt[crypto]
docker compose -p rap-e2e -f infra/docker/docker-compose.yml -f tests/e2e/docker-compose.e2e.yml \
  up -d --build postgres redis minio minio-init api web
cd tests/e2e && npx playwright test

# WorkOS mock: add the overlay
docker compose -p rap-e2e -f infra/docker/docker-compose.yml -f tests/e2e/docker-compose.e2e.yml \
  -f tests/e2e/docker-compose.e2e-workos.yml up -d --build
cd tests/e2e && npx playwright test auth-workos.spec.ts
```

- Journeys are serial and build on each other: `workers: 1`, `retries: 0`. A flaky failure is a bug to fix,
  not to retry.
- Chromium is the default project; Firefox and WebKit projects prove cross-engine behaviour.
- Traces and screenshots are kept on failure.
- Tear down with `docker compose -p rap-e2e down -v`.
