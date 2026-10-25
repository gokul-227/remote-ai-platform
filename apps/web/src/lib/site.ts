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
  job_type?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_period?: string | null;
  currency?: string | null;
};

const EMPLOYMENT: Record<string, string> = {
  fulltime: "FULL_TIME",
  parttime: "PART_TIME",
  contract: "CONTRACTOR",
  contractor: "CONTRACTOR",
  freelance: "CONTRACTOR",
  temporary: "TEMPORARY",
  internship: "INTERN",
};

/**
 * schema.org JobPosting for Google's job search (structured data). Remote jobs
 * use jobLocationType TELECOMMUTE; listings expire 90 days after posting, the
 * same window the platform keeps imported jobs.
 */
export function jobPostingJsonLd(job: PublicJob, siteUrl: string): Record<string, unknown> {
  const posted = job.posted_at ? new Date(job.posted_at) : new Date();
  const until = new Date(posted.getTime() + 90 * 24 * 3600 * 1000);
  const type = EMPLOYMENT[(job.job_type || "").toLowerCase().replace(/[\s_-]+/g, "")];
  const unit = { year: "YEAR", month: "MONTH", hour: "HOUR" }[job.salary_period || "year"] ?? "YEAR";
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: job.description || job.title,
    identifier: { "@type": "PropertyValue", name: "Remote AI Platform", value: job.id },
    datePosted: posted.toISOString(),
    validThrough: until.toISOString(),
    hiringOrganization: { "@type": "Organization", name: job.company_name },
    url: `${siteUrl}/jobs/${job.id}`,
    directApply: Boolean(job.company_id),
  };
  if (type) ld.employmentType = type;
  if (job.is_remote) {
    ld.jobLocationType = "TELECOMMUTE";
    ld.applicantLocationRequirements = { "@type": "Country", name: "Worldwide" };
  }
  if (job.location && !/^remote$/i.test(job.location.trim())) {
    ld.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location } };
  }
  if (job.salary_min || job.salary_max) {
    ld.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.currency || "USD",
      value: {
        "@type": "QuantitativeValue",
        ...(job.salary_min ? { minValue: job.salary_min } : {}),
        ...(job.salary_max ? { maxValue: job.salary_max } : {}),
        unitText: unit,
      },
    };
  }
  if (job.skills?.length) ld.skills = job.skills.join(", ");
  return ld;
}

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
