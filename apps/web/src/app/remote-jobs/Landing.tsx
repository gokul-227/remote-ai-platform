import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_URL } from "@/lib/site";
import { breadcrumbJsonLd } from "@/lib/brand";
import { socialMetadata } from "@/lib/share";
import {
  MIN_INDEXABLE_JOBS,
  fetchLandingJobs,
  fetchLandingStats,
  landingIntro,
  lastPage,
  pageHref,
  parsePage,
  type LandingFilter,
} from "@/lib/landing";
import { Breadcrumbs, JsonLd, PublicFrame } from "../PublicChrome";
import { JobList, JoinCta } from "./JobList";

export type LandingSpec = {
  path: string;
  heading: string;
  /** "remote Python roles", used in the intro sentence. */
  subject: string;
  filter: LandingFilter;
  trail: [string, string][];
  related?: { title: string; links: { href: string; label: string }[] }[];
  note?: string;
};

type Search = Promise<Record<string, string | string[] | undefined>>;

/** Title, description, self-canonical per page, and noindex for thin or out-of-range pages. */
export async function landingMetadata(spec: LandingSpec | null, searchParams: Search): Promise<Metadata> {
  if (!spec) return { title: "Not found | Remote AI Platform", robots: { index: false } };
  const page = parsePage((await searchParams).page);
  const stats = await fetchLandingStats(spec.filter);
  const total = stats?.total ?? 0;
  const suffix = page && page > 1 ? ` – page ${page}` : "";
  const title = `${spec.heading} (${total.toLocaleString("en-US")})${suffix} | Remote AI Platform`;
  const top = stats?.top_companies.slice(0, 2).map((c) => c.name) ?? [];
  const description =
    `${total.toLocaleString("en-US")} open ${spec.subject}` +
    (stats?.new_last_7_days ? `, ${stats.new_last_7_days} new this week` : "") +
    (top.length ? `, at employers like ${top.join(" and ")}` : "") +
    ". Each listing links to the employer or original job board.";
  const path = pageHref(spec.path, page ?? 1);
  const thin = total < MIN_INDEXABLE_JOBS || !page || page > lastPage(total);
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: thin ? { index: false, follow: true } : undefined,
    ...socialMetadata({ title, description, path }),
  };
}

export async function LandingPage({ spec, searchParams }: { spec: LandingSpec | null; searchParams: Search }) {
  if (!spec) notFound();
  const page = parsePage((await searchParams).page);
  if (!page) notFound();
  const [{ jobs, total }, stats] = await Promise.all([
    fetchLandingJobs(spec.filter, page),
    fetchLandingStats(spec.filter),
  ]);
  const last = lastPage(total);
  if (page > last) notFound();
  const intro = page === 1 ? landingIntro(spec.subject, stats) : [];
  const site = SITE_URL || "https://remoteaiplatform.com";
  return (
    <PublicFrame wide>
      <Breadcrumbs trail={spec.trail} />
      <h1 className="mt-3 text-3xl font-bold text-navy">
        {spec.heading}
        {page > 1 ? ` – page ${page}` : ""}
      </h1>
      {intro.map((p) => (
        <p key={p} className="mt-2 max-w-3xl text-slate-600">
          {p}
        </p>
      ))}
      <p className="mt-2 max-w-3xl text-slate-600">
        {total.toLocaleString("en-US")} open roles, newest first.{" "}
        {spec.note ?? "Every listing links to the employer or original job board."}
      </p>
      <div className="mt-6">
        <JobList jobs={jobs} />
      </div>
      {last > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between text-sm">
          {page > 1 ? (
            <a rel="prev" href={pageHref(spec.path, page - 1)} className="font-semibold text-brand underline">
              ← Newer jobs
            </a>
          ) : (
            <span />
          )}
          <span className="text-slate-600">
            Page {page} of {last}
          </span>
          {page < last ? (
            <a rel="next" href={pageHref(spec.path, page + 1)} className="font-semibold text-brand underline">
              Older jobs →
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}
      <JoinCta />
      {spec.related
        ?.filter((r) => r.links.length)
        .map((r) => (
          <section key={r.title} className="mt-6">
            <h2 className="mb-3 text-lg font-bold">{r.title}</h2>
            <div className="flex flex-wrap gap-2">
              {r.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm hover:border-brand hover:text-brand"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </section>
        ))}
      <JsonLd
        data={[
          breadcrumbJsonLd(site, spec.trail),
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            itemListElement: jobs.map((j, i) => ({
              "@type": "ListItem",
              position: (page - 1) * 50 + i + 1,
              url: `${site}/jobs/${j.id}`,
            })),
          },
        ]}
      />
    </PublicFrame>
  );
}
