# Admin console

Separate deployable for staff (`admin.remoteaiplatform.com`, `admin-dev.remoteaiplatform.com`).
It is a static Next.js export with no server code: the hostname is not a security boundary,
the API is. Every call goes to `/api/v1/admin/*` (or other staff endpoints) and the API checks
the ADMIN role server-side. Never add provider secrets here; only `NEXT_PUBLIC_*` values that
are already public (API URL, Supabase URL and publishable key, environment name).

Next.js here is the same pinned version as `apps/web`; read `node_modules/next/dist/docs/`
before using unfamiliar APIs.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
