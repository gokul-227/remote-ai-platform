# Conventions

## Branches

Feature branch → `dev` (CI only) → `prod` (deploys). `enforce-branch-flow.yml` checks the order. Commit
small, tested changes; never commit secrets (see [secrets-and-config](../operations/secrets-and-config.md)).

## Backend

- One package per bounded context in `app/domains/`; routers under `/api/v1`.
- Every endpoint declares a Pydantic `response_model`; public endpoints use public-only schemas (the schema
  is the privacy filter and the typed contract — ADR-004).
- One member account: roles `ENGINEER` and `COMPANY` pass the same gates; ownership checks decide who may
  act. Staff endpoints require `ADMIN`; every staff mutation writes `audit_events` with a reason.
- AI calls go through LiteLLM only and reserve then settle quota (`services/ai/metering.py`). Assistant
  tools declare their kind; consequential writes need user confirmation.
- Contract and milestone state changes only via `app/domains/contracts/lifecycle.py`. Money movement stays
  behind `MARKETPLACE_PAYMENTS_ENABLED`.
- User-supplied links must be http(s) (`HttpUrlIn` server-side, `safeHref` client-side).
- New user-linked tables must be classified in the data export (`auth/export.py`); a test fails otherwise.
- Background work is a Celery task recorded in `task_runs`; never rely on Redis as the record.

## Frontend

- Product UI in `apps/web/src/figma`, hash-routed. A new screen needs a route in `App.tsx`, an entry in the
  navigation catalog (`rap_shell.tsx`), a feature in `tools/architecture/product.yaml`, and — if the
  assistant should open it — an entry in `SCREENS` in `apps/api/app/domains/assistant/tools.py`.
- Own CSS/Tailwind utilities, no component library. Data fetching through `useApi` (keyed by account,
  path and params — ADR-001).
- Copy says "professional", never "engineer". No escrow claims, no "personal picks", no unverified numbers;
  unfinished features are labelled honestly ("Coming soon") behind a feature flag.
- Strict CSP; no third-party scripts; no `dangerouslySetInnerHTML` with user content.

## Docs

Update the matching page in `docs/` in the same change as the behaviour. Run `make docs-sync` after changing
routers or `tools/architecture/*.yaml`.
