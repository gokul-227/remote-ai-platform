import { isIndexable } from "@/lib/deployEnv";
import { SITE_URL } from "@/lib/site";
import {
  emptySitemap,
  landingSitemap,
  resourceSitemap,
  SITEMAP_KINDS,
  SITEMAP_PAGE_SIZE,
  sitemapEntries,
  staticSitemap,
  xmlResponse,
  type SitemapKind,
} from "@/lib/sitemaps";

// Incremental static regeneration: each shard is generated on its first request,
// served from the web server's cache (well under a second) and regenerated in
// the background at most every 15 minutes. A failed regeneration keeps serving
// the last good copy, so crawlers never see an outage as an empty inventory.
export const revalidate = 900;
export const dynamicParams = true;
// None at build time (the API isn't reachable from the build); each shard is
// generated on first request and cached from then on.
export async function generateStaticParams() {
  return [];
}

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; page: string }> }) {
  const { kind, page } = await params;
  if (!/^(0|[1-9]\d*)\.xml$/.test(page)) return new Response("Not found", { status: 404 });
  const offset = Number(page.slice(0, -4)) * SITEMAP_PAGE_SIZE;
  if (!Number.isSafeInteger(offset) || offset < 0 || ((kind === "static" || kind === "landing") && offset !== 0))
    return new Response("Not found", { status: 404 });
  if (kind !== "static" && kind !== "landing" && !SITEMAP_KINDS.includes(kind as SitemapKind))
    return new Response("Not found", { status: 404 });
  if (!SITE_URL || !isIndexable({ NEXT_PUBLIC_DEPLOY_ENV: process.env.NEXT_PUBLIC_DEPLOY_ENV }))
    return xmlResponse(emptySitemap());
  if (kind === "static") return xmlResponse(staticSitemap());
  // Errors propagate on purpose: Next keeps the previous good copy instead of
  // caching a failure (first-ever generation answers 500 and is retried).
  if (kind === "landing") return xmlResponse(await landingSitemap());
  return xmlResponse(resourceSitemap(kind as SitemapKind, await sitemapEntries(kind as SitemapKind, offset)));
}
