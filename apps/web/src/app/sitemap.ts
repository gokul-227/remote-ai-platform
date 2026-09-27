import type { MetadataRoute } from "next";
import { isIndexable } from "@/lib/deployEnv";
import { SITE_URL, fetchRecentJobs } from "@/lib/site";

// Rebuilt at most hourly: public job pages for crawlers (production only).
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!SITE_URL || !isIndexable({ NEXT_PUBLIC_DEPLOY_ENV: process.env.NEXT_PUBLIC_DEPLOY_ENV })) return [];
  const jobs = await fetchRecentJobs(100);
  return [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    ...jobs
      .filter((j) => !j.expired_at)
      .map((j) => ({
        url: `${SITE_URL}/jobs/${j.id}`,
        lastModified: j.posted_at ? new Date(j.posted_at) : undefined,
        changeFrequency: "daily" as const,
        priority: 0.7,
      })),
  ];
}
