// Public, crawlable pages read only public API endpoints, server-side.

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "";
// Server-side: API_INTERNAL_URL where the public address isn't reachable from
// the server (containers); otherwise the public API URL.
export const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
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
  source?: string | null;
  company_id?: string | null;
  skills?: string[];
  job_type?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_period?: string | null;
  currency?: string | null;
};

// ISO 3166 alpha-2 codes for country names (and common spellings) found in free-text locations.
const COUNTRY_NAMES: [RegExp, string][] = [
  [/\b(usa|u\.s\.a?\.?|united states)\b/i, "US"],
  [/\b(canada)\b/i, "CA"],
  [/\b(uk|united kingdom|england|scotland|wales|great britain)\b/i, "GB"],
  [/\b(germany|deutschland)\b/i, "DE"],
  [/\b(france)\b/i, "FR"],
  [/\b(spain)\b/i, "ES"],
  [/\b(netherlands)\b/i, "NL"],
  [/\b(ireland)\b/i, "IE"],
  [/\b(portugal)\b/i, "PT"],
  [/\b(poland)\b/i, "PL"],
  [/\b(italy)\b/i, "IT"],
  [/\b(sweden)\b/i, "SE"],
  [/\b(switzerland)\b/i, "CH"],
  [/\b(austria)\b/i, "AT"],
  [/\b(india)\b/i, "IN"],
  [/\b(australia)\b/i, "AU"],
  [/\b(new zealand)\b/i, "NZ"],
  [/\b(brazil)\b/i, "BR"],
  [/\b(mexico)\b/i, "MX"],
  [/\b(argentina)\b/i, "AR"],
  [/\b(colombia)\b/i, "CO"],
  [/\b(philippines)\b/i, "PH"],
  [/\b(singapore)\b/i, "SG"],
  [/\b(japan)\b/i, "JP"],
  [/\b(south africa)\b/i, "ZA"],
];
const US_STATES =
  /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/;
const CA_PROVINCES = /,\s*(ON|BC|AB|QC|MB|SK|NS|NB|NL|PE)\b/;

/** Countries a free-text location names (ISO codes), most specific evidence only. */
export function inferCountries(location?: string | null): string[] {
  if (!location) return [];
  const out = new Set<string>();
  for (const [re, code] of COUNTRY_NAMES) if (re.test(location)) out.add(code);
  if (US_STATES.test(location)) out.add("US");
  if (CA_PROVINCES.test(location)) out.add("CA");
  return [...out];
}

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
  const unit = { year: "YEAR", month: "MONTH", hour: "HOUR" }[job.salary_period || ""];
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
  const countries = inferCountries(job.location);
  if (job.is_remote) {
    ld.jobLocationType = "TELECOMMUTE";
    // Do not invent worldwide eligibility: only countries the posting names.
    if (countries.length) ld.applicantLocationRequirements = countries.map((name) => ({ "@type": "Country", name }));
  }
  if (!job.is_remote && job.location && !/^remote$/i.test(job.location.trim())) {
    ld.jobLocation = {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: job.location,
        ...(countries.length === 1 ? { addressCountry: countries[0] } : {}),
      },
    };
  }
  if (job.company_id)
    (ld.hiringOrganization as Record<string, unknown>).sameAs = `${siteUrl}/companies/${job.company_id}`;
  if ((job.salary_min != null || job.salary_max != null) && unit && job.currency) {
    ld.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.currency,
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
      return out.length ? out : null;
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
