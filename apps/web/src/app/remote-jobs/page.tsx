import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, fetchRecentJobs } from "@/lib/site";
import { PLACES, TOPICS } from "@/lib/seo";
import { PublicFrame } from "../PublicChrome";
import { JobList, JoinCta } from "./JobList";
import { PublicFilterForm, fetchFilteredJobs } from "./PublicFilters";
import { activeCount, parseFilters } from "@/lib/jobFilters";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const filtered = activeCount(parseFilters(await searchParams)) > 0;
  return {
    title: "Remote jobs and freelance work | Remote AI Platform",
    description:
      "Explore remote jobs and freelance work from employers and job boards. Browse by role, skill and way of working.",
    alternates: { canonical: "/remote-jobs" },
    // Filtered result pages are for people, not search engines (endless URL combinations).
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function RemoteJobsIndex({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(await searchParams);
  const filtered = activeCount(filters) > 0 || !!filters.sort;
  const result = filtered ? await fetchFilteredJobs(filters) : null;
  const latest = result ? result.jobs : (await fetchRecentJobs(30)).filter((j) => !j.expired_at);
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
      {result && (
        <section className="mt-6" aria-live="polite">
          <h2 className="mb-3 text-xl font-bold">
            {result.total.toLocaleString("en-US")} matching job{result.total === 1 ? "" : "s"}
          </h2>
          <JobList jobs={result.jobs} />
        </section>
      )}
      {groups.map((g) => (
        <section key={g} className="mt-8">
          <h2 className="mb-3 text-lg font-bold">{g}</h2>
          <div className="flex flex-wrap gap-2">
            {TOPICS.filter((t) => t.group === g).map((t) => (
              <Link
                key={t.slug}
                href={`/remote-jobs/${t.slug}`}
                className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium hover:border-[#175CD3] hover:text-[#175CD3]"
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
              className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium hover:border-[#175CD3] hover:text-[#175CD3]"
            >
              Remote jobs in {p.name}
            </Link>
          ))}
        </div>
      </section>
      <JoinCta />
      {!result && (
        <>
          <h2 className="mb-3 text-xl font-bold">Latest remote jobs</h2>
          <JobList jobs={latest} />
        </>
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
