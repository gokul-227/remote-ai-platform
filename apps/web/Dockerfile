# apps/web as a self-contained Next.js server (output: "standalone").
#
# Build context is the repo ROOT: this is an npm workspaces monorepo, the
# lockfile lives at the root and `npm ci` needs every workspace's package.json.
#
#   docker buildx build -f apps/web/Dockerfile --platform linux/arm64,linux/amd64 \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.remoteaiplatform.com ... .
#
# NEXT_PUBLIC_* values are inlined at build time, so an image is built for one
# environment (production) and carries its build SHA in /api/version.

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY tests/e2e/package.json ./tests/e2e/package.json
# The npm bundled with node:22 hard-fails `npm ci` on unsupported-platform
# optional dependencies; the pinned npm (same as CI) skips them correctly.
RUN npm install -g npm@12.1.0 && npm ci --workspace web --include-workspace-root --no-audit --no-fund

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/web ./apps/web
WORKDIR /app/apps/web

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_DEPLOY_ENV
ARG NEXT_PUBLIC_FIREBASE_CONFIG
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_BUILD_SHA
ARG NEXT_PUBLIC_BUILD_TIME
ARG NEXT_PUBLIC_DEPLOYMENT_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_DEPLOY_ENV=$NEXT_PUBLIC_DEPLOY_ENV \
    NEXT_PUBLIC_FIREBASE_CONFIG=$NEXT_PUBLIC_FIREBASE_CONFIG \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_BUILD_SHA=$NEXT_PUBLIC_BUILD_SHA \
    NEXT_PUBLIC_BUILD_TIME=$NEXT_PUBLIC_BUILD_TIME \
    NEXT_PUBLIC_DEPLOYMENT_ID=$NEXT_PUBLIC_DEPLOYMENT_ID \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
# Standalone output mirrors the monorepo layout: server.js is in apps/web.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/version >/dev/null 2>&1 || exit 1
CMD ["node", "apps/web/server.js"]
