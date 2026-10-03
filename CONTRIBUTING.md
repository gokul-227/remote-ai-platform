# Contributing

This is a proprietary repository (see `LICENSE`); contributions are by
invitation only.

## Branches and releases

- `prod` — production (https://remoteaiplatform.com). Default branch.
- `dev` — staging (https://dev.remoteaiplatform.com).
- Work happens on short-lived `feat/…`, `fix/…` or `chore/…` branches from
  `dev`, merged into `dev` by pull request. A release is a pull request from
  `dev` to `prod`; after the production deploy succeeds a dated GitHub Release
  (`vYYYY.MM.DD`) is created automatically.
- Both protected branches require pull requests and these checks: backend,
  frontend, E2E, migration validation, secret scan (gitleaks) and CodeQL.
  Administrators are included; force pushes and deletions are blocked.

## Before opening a pull request

See `CLAUDE.md` for the full commands. At minimum:

```bash
cd apps/api && .venv/bin/ruff check app && .venv/bin/mypy app && .venv/bin/pytest
cd apps/web && npm run lint && npx tsc --noEmit && npm test && npx prettier --check "src/**/*.{ts,tsx}"
```

- One coherent change per pull request, with a regression test for a fix.
- Migrations are additive, never edit an applied migration, and ids fit
  VARCHAR(32).
- Never commit secrets: configuration lives in Infisical and reaches Render
  and GitHub through secret syncs.
