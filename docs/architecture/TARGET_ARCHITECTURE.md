# Target Architecture — Remote AI Platform

Companion to `docs/architecture/FORENSIC_AUDIT.md` (read that first). This describes where the architecture should move toward, incrementally, without discarding what works today. Nothing here is a mandate to rewrite; it's a direction for future phases to converge on as they touch each area.

## Guiding constraints (unchanged from today)

- Modular monolith, not microservices. `apps/api/app/domains/*` stays the shape; domains gain clearer boundaries, they don't get split into separate deployables.
- Provider abstraction where it already exists (AI, payments) is the model to replicate for identity and storage — not a mandate to abstract everything speculatively.
- Free-tier-first stays true until there's a concrete reason (real paying usage, a specific scaling wall) to spend money.

## Domain model changes

**Introduce `Organization` and `OrganizationMember` without breaking `CompanyProfile`:**

```
User ──1:1── CompanyProfile        (today: user owns the profile directly)

User ──┬──── OrganizationMember ──┬── Organization ──1:1── CompanyProfile
       │        (role: owner/     │
       │         admin/recruiter/ │
       │         member)          │
       └── (a user can belong to multiple orgs)
```

Migration path: add `Organization` + `OrganizationMember` tables; add a nullable `organization_id` to `CompanyProfile`; backfill one `Organization` + one `owner`-role `OrganizationMember` row per existing `CompanyProfile`; then make `organization_id` non-null and switch job/project/contract ownership checks from "does `CompanyProfile.user_id` match the caller" to "is the caller an `OrganizationMember` of the org that owns this `CompanyProfile`, with sufficient role." This preserves every existing row and every existing single-user company account (it just becomes an org of one).

**Consolidate `projects` + `marketplace`:** move `ProjectTask`, `TaskComment`, `TaskDependency`, `TaskAssignmentOffer`, `WorkSubmission`, `WorkLedgerEntry`, `ProjectReview`, `ProjectActivity` into `projects/models.py`. `AIReport` (genuinely cross-domain) can stay in a small shared module or move to `core/`. Do this as a pure file/import reorganization first (no schema change), then decide whether any of the tables themselves need reshaping.

**Give `payments` its own `models.py`:** move `PaymentTransaction` out of `projects/models.py` into `payments/models.py`. Mechanical, low-risk, unblocks payments eventually being lifted out cleanly.

**Retire `ActivityLog` in favor of `AuditEvent`** once every current writer of `ActivityLog` is confirmed migrated — don't drop the table until then.

## Authorization

Keep the existing pattern (role-gate via `require_role`, then explicit ownership check in the handler) — the audit found it's mostly correct and it's a good foundation. Layer permission-based checks *on top of* it for organization-scoped resources once `Organization`/`OrganizationMember` exists, e.g. `require_org_permission(org_id, "opportunity.create")` resolving from the caller's `OrganizationMember.role`. Don't replace working ownership checks with a permission engine just for its own sake — add it where role-per-org actually matters (a `recruiter` should be able to post jobs; a `finance` member shouldn't).

## Identity

Keep direct OAuth2 (Google/Microsoft) as implemented this session — it's the right call for the current free-tier constraint (Keycloak doesn't fit). Wrap the *concept* behind a small `IdentityProvider`-shaped interface only if/when a third provider (GitHub, Apple, SAML/Entra federation) is actually requested — don't build the abstraction speculatively ahead of a second real consumer beyond Google/Microsoft, which already share nearly all of `oauth.py`'s logic.

## AI layer

Already provider-abstracted (LiteLLM) with real failover and usage logging — this is the AI Gateway concept described by the master directive; it doesn't need reinvention, just extension (more agents) and documentation (the Quality agent is real and currently undocumented in `CLAUDE.md`).

## Observability

The most valuable and lowest-effort observability fix: make whatever endpoint Render/Docker actually treats as the traffic gate (`/health/live`) check real dependencies (DB at minimum), and fix the `is_production`/`APP_ENV` fail-open bug so a misconfigured deployment fails loudly instead of silently booting with dev secrets.

## Frontend

Introduce Vitest + React Testing Library (or Playwright component tests) starting with the highest-risk untested surfaces (auth forms, job posting, payment flows) rather than chasing coverage percentage. Add a stylelint/eslint rule forbidding raw brand hex literals outside `globals.css` to stop the 38-file drift from recurring.
</content>
