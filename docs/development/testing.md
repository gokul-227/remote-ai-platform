# Testing

```bash
cd apps/api   && .venv/bin/pytest && .venv/bin/ruff check . && .venv/bin/mypy app
cd apps/web   && npm run lint && npx tsc --noEmit && npm test
cd apps/admin && npm run lint && npm test
make docs-check   # generated architecture + OpenAPI are current
```

- Backend tests run on SQLite with test tokens; CI fails below **80 %** coverage.
- Concurrency, locking and RLS are tested on real PostgreSQL (`tests/test_postgres_concurrency.py`); SQLite
  cannot prove them.
- If the shell exports a non-boolean `DEBUG`, run pytest with `DEBUG=false`.
- External HTTP (job boards, AI, WorkOS, Slack) is mocked; a passing suite is not evidence that a provider
  works in production — check the console or Slack after deploying.
- Product copy rules are tested (`claims.test.ts`): no escrow claims, no "personal picks", no unverified numbers.

CI (`ci.yml`) runs all of the above plus the e2e suite, CodeQL and dependency review. Deploys only follow a
green CI on `prod`.
