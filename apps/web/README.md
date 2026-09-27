# apps/web

Next.js 16 / React 19 frontend, deployed to Cloudflare Workers with OpenNext.

- `src/figma/` — the product UI: a client-rendered, hash-routed app (`App.tsx` routes, `rap_*.tsx`
  screens, `rap_kit.tsx` shared components, `live.ts` API helpers such as `useApi` and `goRoute`).
- `src/lib/` — Supabase sign-in, session storage (`auth.tsx`), the axios API client (`api.ts`), build info.
- `src/app/` — the Next.js shell: `/` renders the app; `jobs/[id]` is the server-rendered public job page;
  `[...slug]` redirects known old path URLs to hash routes and 404s everything else (`not-found.tsx`);
  `sitemap.ts`/`robots.ts` (production only indexable); `/api/version` and `/health/version` report the build.

```bash
npm run dev          # :3000 (needs NEXT_PUBLIC_API_URL and the dev Supabase NEXT_PUBLIC_SUPABASE_* vars)
npm run lint && npx tsc --noEmit && npm test
npm run cf:build     # the exact Cloudflare artifact CI deploys
```

This repo pins recent Next.js/React versions; read `node_modules/next/dist/docs/` before relying on
remembered conventions (see `AGENTS.md`).
