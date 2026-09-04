// Cloudflare Workers deployment config (via @opennextjs/cloudflare).
//
// No incrementalCache override for now -- this app is mostly dynamic/
// authenticated content, not ISR-heavy, and R2 (the recommended cache
// backend) requires a one-time manual "enable R2" step in the Cloudflare
// dashboard that hasn't been done yet. Add r2-incremental-cache back here
// (and the matching r2_buckets binding in wrangler.jsonc) once R2 is
// enabled, if ISR caching turns out to matter in practice.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
