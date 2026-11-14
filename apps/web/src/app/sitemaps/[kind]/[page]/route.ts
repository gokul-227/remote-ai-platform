import { isIndexable } from "@/lib/deployEnv";
import { SITE_URL } from "@/lib/site";
import {
  emptySitemap,
  resourceSitemap,
  SITEMAP_KINDS,
  SITEMAP_PAGE_SIZE,
  sitemapEntries,
  staticSitemap,
  xmlResponse,
  type SitemapKind,
} from "@/lib/sitemaps";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; page: string }> }) {
  const { kind, page } = await params;
  if (!/^(0|[1-9]\d*)\.xml$/.test(page)) return new Response("Not found", { status: 404 });
  const offset = Number(page.slice(0, -4)) * SITEMAP_PAGE_SIZE;
  if (!Number.isSafeInteger(offset) || offset < 0 || (kind === "static" && offset !== 0))
    return new Response("Not found", { status: 404 });
  if (kind !== "static" && !SITEMAP_KINDS.includes(kind as SitemapKind))
    return new Response("Not found", { status: 404 });
  if (!SITE_URL || !isIndexable({ NEXT_PUBLIC_DEPLOY_ENV: process.env.NEXT_PUBLIC_DEPLOY_ENV }))
    return xmlResponse(emptySitemap());
  if (kind === "static") return xmlResponse(staticSitemap());
  try {
    return xmlResponse(resourceSitemap(kind as SitemapKind, await sitemapEntries(kind as SitemapKind, offset)));
  } catch {
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Retry-After": "900" } });
  }
}
