import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Prerendered pages ("/" -- the hash-routed app shell every visit loads --
// /auth/callback, robots.txt, 404) are served from Workers static assets
// instead of being re-rendered on each request, which cost ~15 ms of CPU per
// warm request against the free plan's 10 ms budget (PERF-02). This cache is
// read-only: nothing here revalidates (the sitemap is dynamic instead).
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
