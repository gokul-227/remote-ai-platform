# Testing

Every request carries generated tests (from the OpenAPI document) and may add hand-written ones.

## Generated tests (all 182 requests)

| Test | When |
| --- | --- |
| No server error (5xx) — a 503 that explains itself (AI not configured, payments off) is allowed | always |
| Responds within `max_response_ms` | always (per environment: local 3 s, dev 30 s for cold starts, prod 10 s) |
| Status is the documented success code | on 2xx |
| Responds with JSON and the body matches the OpenAPI response schema | on 2xx, for the 168 requests that document a response schema |
| Error response explains the failure (`error` or `detail`) | on 4xx |
| Stores returned ids for later requests | on 2xx, for list/create requests |

Before each request, generated guards skip it — with a console message — when the environment is read-only
(`allow_writes`), when it would end the session or delete the account (`allow_destructive`), or when an id it
needs has not been captured yet.

## Run from a terminal (Postman CLI)

```bash
make postman-stack                 # API on :8000 + local sign-in (code 123456), needs Docker
make postman-test                  # whole collection, environment "local"
make postman-test ENV=dev          # against dev (set email/supabase values first)
make postman-stack-down
```

CI runs the whole collection against a fresh stack on every pull request that touches the API.
