FROM node:22-alpine AS base

# This is an npm workspaces monorepo -- the lockfile lives at the repo root,
# not in apps/web, and `npm ci` needs every workspace's package.json present
# to resolve the workspace graph correctly. The build context for this
# Dockerfile is the repo ROOT (see infra/docker/docker-compose.yml's `web`
# service), not apps/web, specifically so this stage can see those files.
# Installing from apps/web/package.json alone (no root lockfile, no sibling
# workspace manifests) previously failed outright: `npm ci` had no lockfile
# to install from, and the `npm install` fallback hit a real npm bug
# ("Cannot read properties of null (reading 'edgesOut')") trying to resolve
# a workspace member's dependencies with no workspace context at all.

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY tests/e2e/package.json ./tests/e2e/package.json
# The npm bundled with node:22-alpine hard-fails `npm ci` on an
# unsupported-platform *optional* dependency (e.g. an esbuild AIX/ppc64
# binary) instead of skipping it as it's supposed to -- a known npm bug,
# fixed in newer npm releases.
RUN npm install -g npm@latest && npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
WORKDIR /app/apps/web

# NEXT_PUBLIC_* vars are baked in at build time, not read at runtime -- must
# be passed as build args (docker-compose build.args / --build-arg), not
# just container `environment:`, which has no effect on them.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

ENV NEXT_TELEMETRY_DISABLED=1
# Use webpack bundler to avoid Turbopack/PostCSS incompatibility
RUN npm run build -- --webpack

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/package.json ./package.json

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "start"]
