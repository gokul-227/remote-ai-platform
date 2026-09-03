// Cloudflare Workers deployment config (via @opennextjs/cloudflare).
// Incremental cache (ISR) is backed by an R2 bucket -- see wrangler.jsonc.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
