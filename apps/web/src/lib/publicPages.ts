/** Data for the public people, company and post pages (server-side, no sign-in). */
import { API_URL } from "./site";
import type { PublicJob } from "./site";

export type PublicPerson = {
  id: string;
  full_name?: string | null;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  primary_role?: string | null;
  years_of_experience?: number;
  skills?: string[];
  availability?: string | null;
  updated_at?: string;
};
export type PublicCompany = {
  id: string;
  name: string;
  description?: string | null;
  industry?: string | null;
  company_size?: string | null;
  location?: string | null;
  website?: string | null;
  logo_url?: string | null;
  tech_stack?: string[];
};
export type PublicPost = {
  id: string;
  content: string;
  image_url?: string | null;
  link_url?: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  author: { name?: string | null; headline?: string | null; profile_id?: string | null };
};
export type SeoKind = "people" | "companies" | "posts";

async function get<T>(path: string, revalidate = 3600): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1${path}`, { next: { revalidate } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

const UUID = /^[0-9a-f-]{36}$/i;
export const fetchPerson = (id: string) => (UUID.test(id) ? get<PublicPerson>(`/engineers/${id}`) : null);
export const fetchCompany = (id: string) => (UUID.test(id) ? get<PublicCompany>(`/companies/${id}`) : null);
export const fetchCompanyJobs = async (id: string) => (await get<PublicJob[]>(`/jobs/company/${id}?limit=50`)) ?? [];
export const fetchPost = (id: string) => (UUID.test(id) ? get<PublicPost>(`/public/posts/${id}`) : null);

/** Ids of every public profile, company page or public post, for the sitemap. */
export async function fetchSeoEntries(kind: SeoKind, max = 20000): Promise<{ id: string; updated_at: string }[]> {
  const out: { id: string; updated_at: string }[] = [];
  while (out.length < max) {
    const batch = await get<{ id: string; updated_at: string }[]>(
      `/public/sitemap-entries?kind=${kind}&skip=${out.length}&limit=5000`,
    );
    if (!batch) break;
    out.push(...batch);
    if (batch.length < 5000) break;
  }
  return out;
}

/** JSON for a <script type="application/ld+json">, escaped so content can't close the tag. */
export const ldJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
