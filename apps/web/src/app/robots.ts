import type { MetadataRoute } from "next";
import { isIndexable } from "@/lib/deployEnv";
import { SITE_URL } from "@/lib/site";

// Only production may be crawled; the dev site, previews and local builds
// must never be indexed (they duplicate production and point at test data).
export default function robots(): MetadataRoute.Robots {
  // Referenced directly so the build inlines it (Workers have no runtime env for it).
  return isIndexable({ NEXT_PUBLIC_DEPLOY_ENV: process.env.NEXT_PUBLIC_DEPLOY_ENV })
    ? { rules: { userAgent: "*", allow: "/" }, ...(SITE_URL ? { sitemap: `${SITE_URL}/sitemap.xml` } : {}) }
    : { rules: { userAgent: "*", disallow: "/" } };
}
