import type { MetadataRoute } from "next";
import { isIndexable } from "@/lib/deployEnv";
import { SITE_URL, fetchRecentJobs, fetchSitemapEntries } from "@/lib/site";

// Built per request: the Worker's incremental cache is read-only static
// assets (PERF-02), so an hourly ISR sitemap would freeze at build time.
// Crawlers fetch it rarely; the API's sitemap-entries endpoint is cheap.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!SITE_URL || !isIndexable({ NEXT_PUBLIC_DEPLOY_ENV: process.env.NEXT_PUBLIC_DEPLOY_ENV })) return [];
  // Every public job (SEO-01); an older API without the sitemap endpoint
  // falls back to the newest 100.
  const entries =
    (await fetchSitemapEntries()) ??
    (await fetchRecentJobs(100))
      .filter((j) => !j.expired_at)
      .map((j) => ({ id: j.id, posted_at: j.posted_at, updated_at: j.posted_at }));
  return [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    ...entries.map((j) => {
      const changed = j.updated_at ?? j.posted_at;
      return {
        url: `${SITE_URL}/jobs/${j.id}`,
        lastModified: changed ? new Date(changed) : undefined,
        changeFrequency: "daily" as const,
        priority: 0.7,
      };
    }),
  ];
}
