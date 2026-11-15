# 820px staff-console regression

Run from the repository root:

```sh
npx playwright test --config apps/admin/playwright.config.ts
```

The test starts its own loopback-only admin dev server on port 14322, mocks
WorkOS email-code authentication and API responses, and aborts unexpected
external requests. It needs the repository dependencies and Playwright Chromium.
It does not need a database, credentials, or a running API.

The 820×1180 Chromium journey checks both sign-in steps, populated Staff & roles
and Feature flags tables, account control bounds, navigation reachability and a
flag confirmation dialog (cancelled without writing).

On 2026-11-15, before any application CSS/component changes, this journey passed
against the current source. At 820px the signed-in header and document both
measured 820px wide (grid tracks: 34px / 598.047px / 155.953px). The historical
84px overflow in docs/product/feature-audit.md was **not reproduced**. No CSS fix
is claimed. This is local mocked UI evidence, not final-image or production
acceptance; provider, environment-label and real-data differences remain outside
this fixture. Keep the historical audit item open pending reproduction against
the originally failing configuration.

Verification: focused Playwright journey passed; admin TypeScript check passed;
admin Vitest reported 4 files / 10 tests passed.
