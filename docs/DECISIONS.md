# WorkMesh AI — Architectural Decision Records (ADR)

## ADR 001: Modular Monolith over Microservices
- **Status**: Approved / Preserved
- **Context**: The product covers networking, jobs, matching, messaging, projects, and administration.
- **Decision**: Keep all domain boundaries within a single FastAPI backend monorepo package (`apps/api/app/domains/`). Avoid splitting into microservices or introducing service-to-service HTTP/gRPC overhead.
- **Consequences**: Simplified deployment, transactional boundary control, easy local development with zero network latency between modules.

## ADR 002: Provider Abstraction via LiteLLM
- **Status**: Approved / Preserved
- **Context**: AI capability needs to support local models (Ollama) and multiple cloud providers (Groq, OpenAI, Gemini) without vendor lock-in.
- **Decision**: All AI completion calls must pass through `apps/api/app/agents/llm_client.py` using LiteLLM. No direct provider SDK imports permitted in domain code.
- **Consequences**: Zero vendor lock-in, effortless fallback chaining, ability to test completely offline using Ollama.

## ADR 003: Hand-Rolled Enterprise Styling with Tailwind v4 & Webpack Build
- **Status**: Approved / Preserved
- **Context**: Frontend styling uses custom utility CSS and Tailwind v4 in Next.js 16.
- **Decision**: Retain existing Tailwind v4 design tokens in `globals.css`. Production build uses `npx next build --webpack` to avoid Turbopack PostCSS evaluation conflicts.
- **Consequences**: Consistent enterprise visual appearance without introducing third-party component library overhead.

## ADR 004: Free-First Infrastructure & S3 Compatibility
- **Status**: Approved / Preserved
- **Context**: Development and deployment must support open-source and self-hosted components.
- **Decision**: Use MinIO for object storage (S3 compatible), Keycloak for optional OIDC authentication, PostgreSQL 16 for data, and Redis 7 + Celery 5 for async queues.
- **Consequences**: Completely free local development experience with a clean cloud deployment path.
