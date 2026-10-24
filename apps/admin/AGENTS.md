# Admin console

Separate deployable for staff (`admin.remoteaiplatform.com`, `admin-dev.remoteaiplatform.com`).
It is a static Next.js export with no server code: the hostname is not a security boundary,
the API is. Every call goes to `/api/v1/admin/*` (or other staff endpoints) and the API checks
the ADMIN role server-side. Never add provider secrets here; only `NEXT_PUBLIC_*` values that
are already public (API URL, Supabase URL and publishable key, environment name).

Next.js here is the same pinned version as `apps/web`; read `node_modules/next/dist/docs/`
before using unfamiliar APIs.
