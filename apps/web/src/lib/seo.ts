/**
 * Public landing pages for job categories (/remote-jobs/<topic>): what job
 * boards rank with ("remote python jobs", "freelance react jobs"). Each topic
 * maps to a filter on the public job list.
 */
import { API_URL } from "./site";
import type { PublicJob } from "./site";

export type Topic = { slug: string; name: string; query?: string; jobType?: string; group: string };

export const TOPICS: Topic[] = [
  // Engineering
  { slug: "python", name: "Python", query: "python", group: "Engineering" },
  { slug: "javascript", name: "JavaScript", query: "javascript", group: "Engineering" },
  { slug: "typescript", name: "TypeScript", query: "typescript", group: "Engineering" },
  { slug: "react", name: "React", query: "react", group: "Engineering" },
  { slug: "node", name: "Node.js", query: "node", group: "Engineering" },
  { slug: "java", name: "Java", query: "java", group: "Engineering" },
  { slug: "golang", name: "Go", query: "golang", group: "Engineering" },
  { slug: "rust", name: "Rust", query: "rust", group: "Engineering" },
  { slug: "frontend", name: "Frontend", query: "frontend", group: "Engineering" },
  { slug: "backend", name: "Backend", query: "backend", group: "Engineering" },
  { slug: "full-stack", name: "Full-stack", query: "full stack", group: "Engineering" },
  { slug: "mobile", name: "Mobile", query: "mobile", group: "Engineering" },
  { slug: "ios", name: "iOS", query: "ios", group: "Engineering" },
  { slug: "android", name: "Android", query: "android", group: "Engineering" },
  { slug: "devops", name: "DevOps", query: "devops", group: "Engineering" },
  { slug: "site-reliability", name: "Site reliability (SRE)", query: "reliability", group: "Engineering" },
  { slug: "cloud", name: "Cloud", query: "cloud", group: "Engineering" },
  { slug: "security", name: "Security", query: "security", group: "Engineering" },
  { slug: "qa", name: "QA & testing", query: "qa", group: "Engineering" },
  // Data & AI
  { slug: "data-engineer", name: "Data engineering", query: "data engineer", group: "Data & AI" },
  { slug: "data-science", name: "Data science", query: "data scientist", group: "Data & AI" },
  { slug: "data-analyst", name: "Data analyst", query: "analyst", group: "Data & AI" },
  { slug: "machine-learning", name: "Machine learning", query: "machine learning", group: "Data & AI" },
  { slug: "ai", name: "AI", query: "ai", group: "Data & AI" },
  // Product & design
  { slug: "product-manager", name: "Product management", query: "product manager", group: "Product & design" },
  { slug: "designer", name: "Design", query: "designer", group: "Product & design" },
  { slug: "ux", name: "UX", query: "ux", group: "Product & design" },
  // Business
  { slug: "marketing", name: "Marketing", query: "marketing", group: "Business" },
  { slug: "sales", name: "Sales", query: "sales", group: "Business" },
  { slug: "customer-support", name: "Customer support", query: "support", group: "Business" },
  { slug: "customer-success", name: "Customer success", query: "customer success", group: "Business" },
  { slug: "finance", name: "Finance", query: "finance", group: "Business" },
  { slug: "hr", name: "HR & recruiting", query: "recruit", group: "Business" },
  { slug: "operations", name: "Operations", query: "operations", group: "Business" },
  { slug: "writing", name: "Writing & content", query: "content", group: "Business" },
  { slug: "project-manager", name: "Project management", query: "project manager", group: "Business" },
  // Ways of working
  { slug: "freelance", name: "Freelance", jobType: "freelance", group: "Ways of working" },
  { slug: "contract", name: "Contract", jobType: "contract", group: "Ways of working" },
  { slug: "part-time", name: "Part-time", jobType: "part-time", group: "Ways of working" },
  { slug: "internship", name: "Internship", jobType: "internship", group: "Ways of working" },
];

export const topicBySlug = (slug: string) => TOPICS.find((t) => t.slug === slug);

/** The keyword topic a search term names exactly (slug, name or query), if any. */
export function topicForSearch(q: string): Topic | null {
  const term = q.trim().toLowerCase();
  return (
    TOPICS.find((t) => !t.jobType && [t.slug, t.name.toLowerCase(), (t.query || "").toLowerCase()].includes(term)) ??
    null
  );
}

/** Up to `limit` newest jobs for a topic, and how many match in total. */
export async function fetchTopicJobs(topic: Topic, limit = 50): Promise<{ jobs: PublicJob[]; total: number }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (topic.query) params.set("query", topic.query);
  if (topic.jobType) params.set("job_type", topic.jobType);
  try {
    const res = await fetch(`${API_URL}/api/v1/jobs?${params}`, { next: { revalidate: 1800 } });
    if (!res.ok) return { jobs: [], total: 0 };
    const jobs: PublicJob[] = await res.json();
    return { jobs, total: Number(res.headers.get("x-total-count")) || jobs.length };
  } catch {
    return { jobs: [], total: 0 };
  }
}

/** Topics a job belongs to, for links from the job page to its landing pages. */
export function topicsForJob(job: PublicJob): Topic[] {
  const text = `${job.title} ${(job.skills ?? []).join(" ")}`.toLowerCase();
  const type = (job.job_type || "").toLowerCase();
  return TOPICS.filter((t) =>
    t.jobType ? type === t.jobType : new RegExp(`\\b${t.query!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text),
  ).slice(0, 6);
}

/**
 * Location landing pages (/remote-jobs/in/<place>): remote roles whose posting
 * names the place (often a residency or time-zone requirement). `match` is the
 * text the API looks for in the job's free-text location.
 */
export type Place = { slug: string; name: string; match: string; kind: "country" | "region" | "anywhere" };
// `match` is sent as the API's location filter: "a|b" matches either spelling.
export const PLACES: Place[] = [
  { slug: "usa", name: "the United States", match: "usa|united states|u.s.", kind: "country" },
  { slug: "canada", name: "Canada", match: "canada", kind: "country" },
  { slug: "uk", name: "the United Kingdom", match: "united kingdom|, uk|england|scotland", kind: "country" },
  { slug: "europe", name: "Europe", match: "europe", kind: "region" },
  { slug: "germany", name: "Germany", match: "germany|deutschland", kind: "country" },
  { slug: "netherlands", name: "the Netherlands", match: "netherlands", kind: "country" },
  { slug: "france", name: "France", match: "france", kind: "country" },
  { slug: "spain", name: "Spain", match: "spain", kind: "country" },
  { slug: "india", name: "India", match: "india", kind: "country" },
  { slug: "australia", name: "Australia", match: "australia", kind: "country" },
  { slug: "latin-america", name: "Latin America", match: "latam|latin america", kind: "region" },
  { slug: "poland", name: "Poland", match: "poland", kind: "country" },
  { slug: "portugal", name: "Portugal", match: "portugal", kind: "country" },
  { slug: "ireland", name: "Ireland", match: "ireland", kind: "country" },
  { slug: "italy", name: "Italy", match: "italy", kind: "country" },
  { slug: "sweden", name: "Sweden", match: "sweden", kind: "country" },
  { slug: "switzerland", name: "Switzerland", match: "switzerland", kind: "country" },
  { slug: "brazil", name: "Brazil", match: "brazil", kind: "country" },
  { slug: "mexico", name: "Mexico", match: "mexico", kind: "country" },
  { slug: "argentina", name: "Argentina", match: "argentina", kind: "country" },
  { slug: "colombia", name: "Colombia", match: "colombia", kind: "country" },
  { slug: "philippines", name: "the Philippines", match: "philippines", kind: "country" },
  { slug: "singapore", name: "Singapore", match: "singapore", kind: "country" },
  { slug: "japan", name: "Japan", match: "japan", kind: "country" },
  { slug: "south-africa", name: "South Africa", match: "south africa", kind: "country" },
  { slug: "new-zealand", name: "New Zealand", match: "new zealand", kind: "country" },
  { slug: "belgium", name: "Belgium", match: "belgium", kind: "country" },
  { slug: "austria", name: "Austria", match: "austria", kind: "country" },
  { slug: "denmark", name: "Denmark", match: "denmark", kind: "country" },
  { slug: "finland", name: "Finland", match: "finland", kind: "country" },
  { slug: "norway", name: "Norway", match: "norway", kind: "country" },
  { slug: "romania", name: "Romania", match: "romania", kind: "country" },
  { slug: "czech-republic", name: "the Czech Republic", match: "czech", kind: "country" },
  { slug: "hungary", name: "Hungary", match: "hungary", kind: "country" },
  { slug: "bulgaria", name: "Bulgaria", match: "bulgaria", kind: "country" },
  { slug: "greece", name: "Greece", match: "greece", kind: "country" },
  { slug: "israel", name: "Israel", match: "israel", kind: "country" },
  {
    slug: "united-arab-emirates",
    name: "the United Arab Emirates",
    match: "united arab emirates|uae|dubai",
    kind: "country",
  },
  { slug: "south-korea", name: "South Korea", match: "south korea", kind: "country" },
  { slug: "malaysia", name: "Malaysia", match: "malaysia", kind: "country" },
  { slug: "nigeria", name: "Nigeria", match: "nigeria", kind: "country" },
  { slug: "kenya", name: "Kenya", match: "kenya", kind: "country" },
  { slug: "worldwide", name: "anywhere in the world", match: "worldwide|anywhere", kind: "anywhere" },
];
/** Whether a free-text location contains any of a place's spellings (as the API filter does). */
export const placeMatches = (p: Place, location?: string | null) =>
  !!location && p.match.split("|").some((m) => m && location.toLowerCase().includes(m));

export const placeBySlug = (slug: string) => PLACES.find((p) => p.slug === slug);

/** Up to `limit` newest remote jobs that name a place, and how many match. */
export async function fetchPlaceJobs(place: Place, limit = 50): Promise<{ jobs: PublicJob[]; total: number }> {
  const params = new URLSearchParams({ limit: String(limit), location: place.match });
  try {
    const res = await fetch(`${API_URL}/api/v1/jobs?${params}`, { next: { revalidate: 1800 } });
    if (!res.ok) return { jobs: [], total: 0 };
    const jobs: PublicJob[] = await res.json();
    return { jobs, total: Number(res.headers.get("x-total-count")) || jobs.length };
  } catch {
    return { jobs: [], total: 0 };
  }
}
