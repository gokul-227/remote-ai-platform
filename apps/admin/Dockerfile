# Staff console: the static export (apps/admin/out) served by a tiny Caddy.
# The edge Caddy (infra/docker/Caddyfile) proxies admin.remoteaiplatform.com here.
# Build context is the repo ROOT (npm workspaces).
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY tests/e2e/package.json ./tests/e2e/package.json
RUN npm install -g npm@12.1.0 && npm ci --workspace admin --include-workspace-root --no-audit --no-fund
COPY apps/admin ./apps/admin
WORKDIR /app/apps/admin
ARG NEXT_PUBLIC_DEPLOY_ENV
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_AUTH_PROVIDER=supabase
ENV NEXT_PUBLIC_DEPLOY_ENV=$NEXT_PUBLIC_DEPLOY_ENV \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_AUTH_PROVIDER=$NEXT_PUBLIC_AUTH_PROVIDER \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM caddy:2.10-alpine
COPY apps/admin/docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/apps/admin/out /srv
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
