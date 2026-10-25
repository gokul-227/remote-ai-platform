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
