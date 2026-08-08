# WorkMesh AI — Remaining Work (Evidence-Based)

**Source:** Forensic audit 2026-08-08. Contains only gaps identified with evidence.

---

## P0 — Blockers (must fix first)

### 1. API crash — wrong import in groups router
- **File:** `apps/api/app/domains/groups/router.py:16`
- **Bug:** `from app.core.security import get_current_user`
- **Fix direction:** import from `app.domains.auth.dependencies` (where `get_current_user` and `require_role` are defined). All other routers import correctly.
- **Impact:** Entire API + all 92 tests + all E2E blocked.

### 2. Database 13 migrations behind
- Live DB `alembic_version` = `009_project_management`; head = `022_groups`.
- **Impact:** Runtime tables absent for offers (011), submissions (012), ledger (013), payments (014), reputation (015), moderation (016), AI logs (017), social feed (019), contracts (020), trust (021), groups (022).
- **Action:** Diff models vs migrations, then apply `alembic upgrade head` (or fresh volume init) after API fix.

### 3. No test can run
- `tests/conftest.py` imports `app.main` → crashes with P0. 24 test files / 92 test functions are dead until P0 fixed.

---

## P1 — Critical

### 4. Keycloak vs local-JWT ambiguity
- Keycloak starts + imports realm (✅) but **API auth does not verify Keycloak tokens** — local JWT path is active. Either integrate KC token verification (OIDC) into `auth/dependencies.py` or explicitly disable KC for API and document. Currently both configured = ambiguous.

### 5. Payments are sandbox-only
- `SandboxPaymentProvider` never contacts a network (by design). Classification: **MOCK_ONLY**. Real adapter (Stripe/etc.) required for paid production.
- Provider abstraction exists (Protocols) but no DI/config switch. When adding real provider, add a registry + env-driven selection.

### 6. Full E2E flows not executable
- Until P0/P1 fixed, all 4 E2E flows remain blocked.

---

## P2 — Important

### 7. Dispatch lifecycle edge cases
Code has task offers + assignment, but missing/weak:
- Rejection (worker rejects offer → notify next candidate)
- Reassignment (task abandoned → re-offer)
- Task expiration/timeout of offers
- Atomic state transition guards (invalid transitions blocked centrally?)
- Audit trail for dispatch transitions

### 8. Notifications incomplete
- Message/unread notifications not implemented.
- Some project/dispatch events lack notification hooks.
- Verify every business event that should notify does (jobs, applications, connections yes; messages/dispatch partial).

### 9. Monitoring/traefik not wired
- `infra/monitoring/*` and `infra/traefik/*` configs exist but are **not in compose**. Either add to compose or remove (dead config).

### 10. Resume upload frontend
- Backend validation exists; frontend upload flow partially wired. Verify full upload → parse → profile update path.

### 11. Job aggregator live verification
- Adapters implemented; Celery beat configured. **Not yet executed against live APIs.** Run once, verify per-source fetch/dedup/error handling; check USAJobs requires auth header (optional key).

---

## P3 — Polish

### 12. Frontend lint
- `npm run lint`: 3 errors, 51 warnings (unused imports). Fix.

### 13. `type-check` script missing
- Add `"type-check": "tsc --noEmit"` and make it pass.

### 14. Empty local venv
- `apps/api/.venv` contains only pip. Developers can't run/lint/test locally without installing deps. Either install deps or add bootstrap script/README.

### 15. Docs overstate completeness
- `docs/CURRENT_STATE.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/FINAL_ENGINEERING_REPORT.md`, `docs/AUDIT.md`, old `docs/VERIFICATION_MATRIX.md`, `docs/HANDOFF.md`, `docs/AGENT_HANDOFF.md` claim COMPLETE/E2E-verified — **contradicted by runtime**. Update to reference forensic docs.

### 16. Runtime artifacts in source tree
- `node_modules/`, `apps/web/.next/`, `.turbo/`, `__pycache__/`, `.pytest_cache/`, `apps/api/.venv/` exist in the repo folder (all gitignored). Clean them for a pristine source state.

### 17. Landing page is static
- `/` is marketing-only (no API). If dynamic feature listing is desired, implement.

### 18. Docker healthchecks
- web/celery have no healthchecks; api healthcheck points to route that returns once API starts. Add healthchecks + restart policies.

---

## Commands That Must Be Run in the Fix Phase

```bash
# 1. Fix P0 in groups/router.py
# 2. Inside api container (after rebuild):
python -m alembic upgrade head
python -m pytest --no-header -q
# 3. Verify:
curl -f http://localhost:8000/api/v1/health
# 4. E2E flows 1-4 against running stack
# 5. Trigger job aggregation once and observe celery worker logs
```

## Do NOT Assume

- Do not assume any feature works just because code exists.
- Do not assume tests pass (0/92 runnable).
- Do not assume payments work (sandbox only).
- Do not assume Keycloak protects the API.
- Do not assume E2E was ever verified in this repo state.