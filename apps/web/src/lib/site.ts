// Public, crawlable pages read only public API endpoints, server-side.

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "";
// Server-side: API_INTERNAL_URL where the public address isn't reachable from
// the server (containers); otherwise the public API URL.
const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PublicJob = {
  id: string;
  title: string;
  company_name: string;
  description: string;
  location?: string | null;
  is_remote?: boolean;
  posted_at?: string;
  expired_at?: string | null;
  external_url?: string | null;
  company_id?: string | null;
  skills?: string[];
};

/** A public job, or null if it doesn't exist or isn't public (hidden/removed). */
export async function fetchPublicJob(id: string): Promise<PublicJob | null> {
  if (!UUID.test(id)) return null;
  const res = await fetch(`${API_URL}/api/v1/jobs/${id}`, { next: { revalidate: 300 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`job ${id}: API answered ${res.status}`);
  return res.json();
}

export type SitemapEntry = { id: string; posted_at: string; updated_at: string };

/** Every publicly listed job's id and dates (SEO-01), paged from the API's
 * lightweight sitemap endpoint and bounded at one sitemap's 50,000 URLs. A
 * failed page ends the walk with what was read so far; null means the endpoint
 * is unavailable (an older API) and the caller should fall back. */
export async function fetchSitemapEntries(max = 50000, page = 5000): Promise<SitemapEntry[] | null> {
  const out: SitemapEntry[] = [];
  while (out.length < max) {
    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/v1/jobs/sitemap-entries?skip=${out.length}&limit=${page}`, {
        next: { revalidate: 3600 },
      });
    } catch {
      break;
    }
    if (!res.ok) return out.length ? out : null;
    const batch: SitemapEntry[] = await res.json();
    out.push(...batch);
    if (batch.length < page) break;
  }
  return out.slice(0, max);
}

/** The newest public jobs, for the sitemap. */
export async function fetchRecentJobs(limit = 100): Promise<PublicJob[]> {
  const res = await fetch(`${API_URL}/api/v1/jobs?limit=${limit}`, { next: { revalidate: 3600 } });
  return res.ok ? res.json() : [];
}

export const summary = (text: string, max = 160) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
};
