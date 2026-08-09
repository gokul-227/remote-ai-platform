# Remaining Work

Date: 2026-08-09

## Local (current state)

The local deployment is complete and verified. No known blocker remains for the local release gate.

## Production / deployment (outside local scope)

- Replace dev default secrets via .env: JWT_SECRET_KEY (32+ chars), KEYCLOAK_CLIENT_SECRET, MINIO_SECRET_KEY, POSTGRES_PASSWORD, KEYCLOAK_ADMIN_PASSWORD
- Set APP_ENV=production (config.validate_production_settings fails fast on weak secrets)
- Wire a real OIDC/Keycloak token flow end-to-end if SSO is required (the API currently validates local JWTs; Keycloak is healthy and realm-imported)
- Real Stripe/payment provider (currently SANDBOX escrow + ledger only)
- Real LLM provider: set AI_PROVIDER/AI_MODEL/AI_API_KEY or reachable OLLAMA_BASE_URL; deterministic fallback used when no LLM is reachable
- Optional: wire infra/traefik and infra/monitoring (Prometheus/Loki) into compose
- Cloud deployment (explicitly out of scope for this task)

## Honest limitations

- AI endpoints work via deterministic fallback unless a local Ollama or LiteLLM/API key is configured
- Job aggregation adapters are implemented with graceful timeout/retry; live external availability depends on the network
- Payments are sandbox ledger entries, not real money movement