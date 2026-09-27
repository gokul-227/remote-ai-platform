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

/** The newest public jobs, for the sitemap. */
export async function fetchRecentJobs(limit = 100): Promise<PublicJob[]> {
  const res = await fetch(`${API_URL}/api/v1/jobs?limit=${limit}`, { next: { revalidate: 3600 } });
  return res.ok ? res.json() : [];
}

export const summary = (text: string, max = 160) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
};
