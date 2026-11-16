/**
 * Programmatic landing pages (role, skill, place, employer and combinations).
 * Every number in their intro text comes from the API's landing-stats
 * aggregate over live jobs; nothing is invented. Pages with fewer than
 * MIN_INDEXABLE_JOBS roles answer noindex and are left out of the sitemap.
 */
import { API_URL } from "./site";
import type { PublicJob } from "./site";
import { PLACES, TOPICS, type Place, type Topic } from "./seo";

export const PAGE_SIZE = 50;
export const MIN_INDEXABLE_JOBS = 3;

export type LandingFilter = { query?: string; jobType?: string; location?: string; employer?: string };
export type LandingStats = {
  total: number;
  new_last_7_days: number;
  top_companies: { name: string; count: number }[];
  salary?: SalaryBand | null;
  /** Published pay per seniority level, same currency/period as `salary` (>= 3 each). */
  salary_by_seniority?: (SalaryBand & { seniority: string })[];
  top_skills?: { name: string; count: number }[];
  /** Matching jobs posted in each of the last four weeks, oldest first. */
  weekly_new?: number[];
};
export type SalaryBand = {
  currency: string;
  period: string;
  count: number;
  low: number;
  median: number;
  high: number;
};
export type Employer = { slug: string; name: string; count: number; latest_posted_at?: string | null };

function params(filter: LandingFilter): URLSearchParams {
  const p = new URLSearchParams();
  if (filter.query) p.set("query", filter.query);
  if (filter.jobType) p.set("job_type", filter.jobType);
  if (filter.location) p.set("location", filter.location);
  if (filter.employer) p.set("employer", filter.employer);
  return p;
}

/** One page of live jobs for a filter, plus the total that match. */
export async function fetchLandingJobs(filter: LandingFilter, page = 1): Promise<{ jobs: PublicJob[]; total: number }> {
  const p = params(filter);
  p.set("limit", String(PAGE_SIZE));
  p.set("skip", String((page - 1) * PAGE_SIZE));
  try {
    const res = await fetch(`${API_URL}/api/v1/jobs?${p}`, { next: { revalidate: 1800 } });
    if (!res.ok) return { jobs: [], total: 0 };
    const jobs: PublicJob[] = await res.json();
    return { jobs: jobs.filter((j) => !j.expired_at), total: Number(res.headers.get("x-total-count")) || jobs.length };
  } catch {
    return { jobs: [], total: 0 };
  }
}

/** Hub navigation needs counts only, not dozens of full salary/skill aggregates. */
export async function fetchLandingCount(filter: LandingFilter): Promise<{ total: number } | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/jobs/landing-count?${params(filter)}`, {
      next: { revalidate: 21600 },
      signal: AbortSignal.timeout(10000),
    });
    return res.ok ? ((await res.json()) as { total: number }) : null;
  } catch {
    return null;
  }
}

export async function fetchLandingStats(filter: LandingFilter): Promise<LandingStats | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/jobs/landing-stats?${params(filter)}`, {
      next: { revalidate: 21600 },
      signal: AbortSignal.timeout(10000),
    });
    return res.ok ? ((await res.json()) as LandingStats) : null;
  } catch {
    return null;
  }
}

export async function fetchEmployers(minJobs = MIN_INDEXABLE_JOBS, limit = 2000): Promise<Employer[]> {
  try {
    const res = await fetch(`${API_URL}/api/v1/jobs/employers?min_jobs=${minJobs}&limit=${limit}`, {
      next: { revalidate: 3600 },
    });
    return res.ok ? res.json() : [];
  } catch {
    return [];
  }
}

export async function fetchEmployer(slug: string): Promise<Employer | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  try {
    const res = await fetch(`${API_URL}/api/v1/jobs/employers/${slug}`, { next: { revalidate: 1800 } });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

/** ?page=N as a positive integer, or null for anything else (the page 404s). */
export function parsePage(raw: string | string[] | undefined): number | null {
  if (raw === undefined) return 1;
  if (typeof raw !== "string" || !/^[1-9]\d{0,3}$/.test(raw)) return null;
  return Number(raw);
}

export const pageHref = (path: string, page: number) => (page <= 1 ? path : `${path}?page=${page}`);
export const lastPage = (total: number) => Math.max(1, Math.ceil(total / PAGE_SIZE));

export const money = (value: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${Math.round(value)} ${currency}`;
  }
};

export const perPeriod = (period: string) =>
  ({ year: "a year", month: "a month", week: "a week", day: "a day", hour: "an hour" })[period] ?? period;

/**
 * Live job count for a landing filter: the aggregate when it answers, else the
 * job list's count, else null. null means "unknown" and must never be treated
 * as a thin page: an API timeout used to mark every landing page noindex.
 */
export async function landingTotal(
  filter: LandingFilter,
): Promise<{ total: number | null; stats: LandingStats | null }> {
  const stats = await fetchLandingStats(filter);
  if (stats) return { total: stats.total, stats };
  const list = await fetchLandingJobs(filter);
  return { total: list.total || list.jobs.length || null, stats: null };
}

/** A factual sentence about new listings over the last four weeks, or null. */
export function trendSentence(weekly?: number[]): string | null {
  if (!weekly || weekly.length < 4 || weekly.every((n) => !n)) return null;
  const f = (n: number) => n.toLocaleString("en-US");
  const [a, b, c, d] = weekly;
  return `New listings per 7-day period over the last four weeks, oldest first: ${f(a)}, ${f(b)}, ${f(c)} and ${f(d)}.`;
}

/** Intro paragraphs built only from real aggregates; empty when there are none. */
export function landingIntro(subject: string, stats: LandingStats | null): string[] {
  if (!stats || !stats.total) return [];
  const out = [
    `There ${stats.total === 1 ? "is" : "are"} ${stats.total.toLocaleString("en-US")} open ${subject} right now` +
      (stats.new_last_7_days
        ? `, ${stats.new_last_7_days.toLocaleString("en-US")} of them posted in the last 7 days.`
        : "."),
  ];
  const top = stats.top_companies.slice(0, 3);
  if (top.length > 1)
    out.push(`Employers with the most openings: ${top.map((c) => `${c.name} (${c.count})`).join(", ")}.`);
  const s = stats.salary;
  if (s && s.count >= MIN_INDEXABLE_JOBS) {
    const per = perPeriod(s.period);
    out.push(
      `${s.count} of these listings publish pay in ${s.currency}: typically ${money(s.low, s.currency)} to ${money(s.high, s.currency)} ${per}, with a median of ${money(s.median, s.currency)}. Many employers don't publish pay, so treat this as a guide.`,
    );
  }
  return out;
}

/** Role × skill pairs (/remote-jobs/<role>/<skill>). */
export const ROLES = [
  "frontend",
  "backend",
  "full-stack",
  "mobile",
  "devops",
  "cloud",
  "security",
  "qa",
  "data-engineer",
  "data-science",
  "machine-learning",
];
export const SKILLS = ["python", "javascript", "typescript", "react", "node", "java", "golang", "rust"];
const bySlug = (slug: string) => TOPICS.find((t) => t.slug === slug);

export function roleSkill(role: string, skill: string): { role: Topic; skill: Topic } | null {
  const r = ROLES.includes(role) ? bySlug(role) : undefined;
  const s = SKILLS.includes(skill) ? bySlug(skill) : undefined;
  return r && s ? { role: r, skill: s } : null;
}

export const topicFilter = (t: Topic): LandingFilter => (t.jobType ? { jobType: t.jobType } : { query: t.query });
export const topicHeading = (t: Topic) => (t.jobType ? `${t.name} remote jobs` : `Remote ${t.name} jobs`);
export const placeFilter = (p: Place): LandingFilter => ({ location: p.match });

/** Every programmatic landing path with the filter that defines it (for the sitemap). */
export function landingCandidates(employers: Employer[]): { path: string; filter: LandingFilter }[] {
  const out: { path: string; filter: LandingFilter }[] = [];
  for (const t of TOPICS) out.push({ path: `/remote-jobs/${t.slug}`, filter: topicFilter(t) });
  for (const p of PLACES) out.push({ path: `/remote-jobs/in/${p.slug}`, filter: placeFilter(p) });
  for (const t of TOPICS)
    for (const p of PLACES)
      out.push({ path: `/remote-jobs/${t.slug}/in/${p.slug}`, filter: { ...topicFilter(t), ...placeFilter(p) } });
  for (const r of ROLES)
    for (const s of SKILLS) {
      const pair = roleSkill(r, s)!;
      out.push({ path: `/remote-jobs/${r}/${s}`, filter: { query: `${pair.role.query} ${pair.skill.query}` } });
    }
  for (const e of employers) out.push({ path: `/remote-jobs/at/${e.slug}`, filter: { employer: e.name } });
  return out;
}
