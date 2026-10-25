import type { MetadataRoute } from "next";
import { isIndexable } from "@/lib/deployEnv";
import { SITE_URL, fetchRecentJobs, fetchSitemapEntries } from "@/lib/site";
import { TOPICS } from "@/lib/seo";
import { fetchSeoEntries } from "@/lib/publicPages";

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
  const [people, companies, posts] = await Promise.all([
    fetchSeoEntries("people"),
    fetchSeoEntries("companies"),
    fetchSeoEntries("posts"),
  ]);
  const page = (path: string, e: { id: string; updated_at: string }, priority: number) => ({
    url: `${SITE_URL}/${path}/${e.id}`,
    lastModified: new Date(e.updated_at),
    changeFrequency: "weekly" as const,
    priority,
  });
  return [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    ...companies.map((e) => page("companies", e, 0.6)),
    ...people.map((e) => page("people", e, 0.5)),
    ...posts.map((e) => page("posts", e, 0.4)),
    { url: `${SITE_URL}/remote-jobs`, changeFrequency: "hourly", priority: 0.9 },
    ...TOPICS.map((t) => ({
      url: `${SITE_URL}/remote-jobs/${t.slug}`,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
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
