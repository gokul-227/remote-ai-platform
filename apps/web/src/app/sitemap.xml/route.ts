import { isIndexable } from "@/lib/deployEnv";
import { SITE_URL } from "@/lib/site";
import { emptySitemap, sitemapCounts, sitemapIndex, xmlResponse } from "@/lib/sitemaps";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!SITE_URL || !isIndexable({ NEXT_PUBLIC_DEPLOY_ENV: process.env.NEXT_PUBLIC_DEPLOY_ENV }))
    return xmlResponse(emptySitemap());
  try {
    return xmlResponse(sitemapIndex(await sitemapCounts()));
  } catch {
    // A temporary outage must not publish a successful, empty inventory to crawlers.
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Retry-After": "900" } });
  }
}
