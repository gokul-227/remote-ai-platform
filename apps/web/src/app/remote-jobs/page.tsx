import type { Metadata } from "next";
import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { SITE_URL } from "@/lib/site";
import { fetchLandingJobs, lastPage, pageHref, parsePage } from "@/lib/landing";
import { PLACES, TOPICS, topicForSearch } from "@/lib/seo";
import { PublicFrame } from "../PublicChrome";
import { JobList, JoinCta } from "./JobList";
import { PublicFilterForm, fetchFilteredJobs } from "./PublicFilters";
import { activeCount, parseFilters } from "@/lib/jobFilters";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const searchTerm = (raw: string | string[] | undefined) => (typeof raw === "string" ? raw.trim().slice(0, 100) : "");

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const q = searchTerm(sp.q);
  const page = parsePage(sp.page);
  return {
    title: q
      ? `Remote jobs matching “${q}” | Remote AI Platform`
      : `Remote jobs and freelance work${page && page > 1 ? ` – page ${page}` : ""} | Remote AI Platform`,
    description:
      "Explore remote jobs and freelance work from employers and job boards. Browse by role, skill, location and company.",
    alternates: { canonical: q ? "/remote-jobs" : pageHref("/remote-jobs", page ?? 1) },
    // Search results are for people; the category pages are what should rank.
    // Filtered result pages likewise (endless URL combinations).
    robots: q || !page || activeCount(parseFilters(sp)) > 0 ? { index: false, follow: true } : undefined,
  };
}

export default async function RemoteJobsIndex({ searchParams }: Props) {
  const sp = await searchParams;
  const q = searchTerm(sp.q);
  const page = parsePage(sp.page) ?? 1;
  // Structured filters (workplace, seniority, ...) beyond the keyword search.
  const filters = { ...parseFilters(sp), ...(q ? { query: q } : {}) };
  // A plain search that is exactly a category ("python", "React") goes to that
  // category's landing page: one URL per topic instead of a noindex duplicate.
  const topic = q && Object.keys(sp).every((k) => k === "q") ? topicForSearch(q) : null;
  if (topic) permanentRedirect(`/remote-jobs/${topic.slug}`);
  const filtered = activeCount({ ...filters, query: undefined }) > 0 || !!filters.sort;
  const result = filtered ? await fetchFilteredJobs(filters) : null;
  const { jobs: latest, total } = result ?? (await fetchLandingJobs(q ? { query: q } : {}, page));
  const last = lastPage(total);
  const base = q ? `/remote-jobs?q=${encodeURIComponent(q)}` : "/remote-jobs";
  const href = (n: number) => (q ? (n <= 1 ? base : `${base}&page=${n}`) : pageHref(base, n));
  const groups = [...new Set(TOPICS.map((t) => t.group))];
  return (
    <PublicFrame wide>
      <nav aria-label="Breadcrumb" className="text-sm text-slate-600">
        <Link href="/" className="hover:underline">
          Remote AI Platform
        </Link>{" "}
        › Remote jobs
      </nav>
      <h1 className="mt-3 text-3xl font-bold">Remote jobs and freelance work</h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        Open roles from leading employers and job boards, refreshed every few hours. Pick a category, or create a free
        profile to get jobs matched to your skills.
      </p>
      <PublicFilterForm value={filters} />
      {groups.map((g) => (
        <section key={g} className="mt-8">
          <h2 className="mb-3 text-lg font-bold">{g}</h2>
          <div className="flex flex-wrap gap-2">
            {TOPICS.filter((t) => t.group === g).map((t) => (
              <Link
                key={t.slug}
                href={`/remote-jobs/${t.slug}`}
                className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium hover:border-brand hover:text-brand"
              >
                Remote {t.name} jobs
              </Link>
            ))}
          </div>
        </section>
      ))}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">By location</h2>
        <div className="flex flex-wrap gap-2">
          {PLACES.map((p) => (
            <Link
              key={p.slug}
              href={`/remote-jobs/in/${p.slug}`}
              className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium hover:border-brand hover:text-brand"
            >
              Remote jobs in {p.name}
            </Link>
          ))}
        </div>
      </section>
      <JoinCta />
      <p className="mb-4">
        <Link href="/remote-jobs/at" className="font-semibold text-brand underline">
          Companies hiring remotely
        </Link>
      </p>
      <h2 className="mb-3 text-xl font-bold">
        {result
          ? `${total.toLocaleString("en-US")} matching job${total === 1 ? "" : "s"}`
          : q
            ? `${total.toLocaleString("en-US")} remote jobs matching “${q}”`
            : "Latest remote jobs"}
      </h2>
      <JobList jobs={latest} />
      {!result && last > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between text-sm">
          {page > 1 ? (
            <a rel="prev" href={href(page - 1)} className="font-semibold text-brand underline">
              ← Newer jobs
            </a>
          ) : (
            <span />
          )}
          <span className="text-slate-600">
            Page {page} of {last}
          </span>
          {page < last ? (
            <a rel="next" href={href(page + 1)} className="font-semibold text-brand underline">
              Older jobs →
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Remote AI Platform", item: `${SITE_URL}/` },
              { "@type": "ListItem", position: 2, name: "Remote jobs", item: `${SITE_URL}/remote-jobs` },
            ],
          }).replace(/</g, "\\u003c"),
        }}
      />
    </PublicFrame>
  );
}
