import { connection } from "next/server";
import Link from "next/link";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { breadcrumbJsonLd } from "@/lib/brand";
import { socialMetadata } from "@/lib/share";
import { GUIDES } from "@/lib/guides";
import { fetchLandingJobs, fetchLandingStats, landingIntro, topicHeading } from "@/lib/landing";
import { APPLY_FAQ, LOCATION_FAQ, landingFaq, livePlaces, liveTopics, type Faq } from "@/lib/hubs";
import { Breadcrumbs, JsonLd, PublicFrame } from "./PublicChrome";
import { JobList, JoinCta } from "./remote-jobs/JobList";
import { FaqSection } from "./Faq";

/** The broad hubs: same live inventory (every remote listing), different angle. */
export type HubKind = "remote-work" | "work-from-home" | "countries";
const HUBS: Record<
  HubKind,
  { path: string; heading: string; subject: string; title: (n: string) => string; lead: string; crumb: string }
> = {
  "remote-work": {
    path: "/remote-work",
    heading: "Remote work",
    crumb: "Remote work",
    subject: "remote jobs",
    title: (n) => `Remote Work: ${n}remote jobs by role and country | Remote AI Platform`,
    lead: "Remote roles from employers and job boards, organised by the kind of work and where you can do it from.",
  },
  "work-from-home": {
    path: "/work-from-home-jobs",
    heading: "Work from home jobs",
    crumb: "Work from home jobs",
    subject: "work-from-home jobs",
    title: (n) => `Work From Home Jobs: ${n}remote jobs you can do from home | Remote AI Platform`,
    lead: "Jobs you can do from home: every listing here is marked remote by its employer or job board.",
  },
  countries: {
    path: "/remote-jobs/in",
    heading: "Remote jobs by country",
    crumb: "By country",
    subject: "remote jobs",
    title: (n) => `Remote Jobs by Country: ${n}remote jobs worldwide | Remote AI Platform`,
    lead: "Remote roles grouped by the country or region their listing names, usually a residency or time-zone rule.",
  },
};

const chip =
  "rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium hover:border-brand hover:text-brand";

export async function hubMetadata(kind: HubKind): Promise<Metadata> {
  const hub = HUBS[kind];
  const stats = await fetchLandingStats({});
  const n = stats?.total ? `${stats.total.toLocaleString("en-US")} ` : "";
  const title = hub.title(n);
  const description =
    `${hub.lead} ` +
    (stats?.total ? `${stats.total.toLocaleString("en-US")} open now` : "Updated every few hours") +
    (stats?.new_last_7_days ? `, ${stats.new_last_7_days.toLocaleString("en-US")} new this week.` : ".");
  return {
    title,
    description,
    alternates: { canonical: hub.path },
    ...socialMetadata({ title, description, path: hub.path }),
  };
}

export async function RemoteHub({ kind }: { kind: HubKind }) {
  await connection();
  const hub = HUBS[kind];
  const site = SITE_URL || "https://remoteaiplatform.com";
  const [stats, latest, places, topics] = await Promise.all([
    fetchLandingStats({}),
    fetchLandingJobs({}),
    livePlaces(),
    liveTopics(),
  ]);
  const trail: [string, string][] =
    kind === "countries"
      ? [
          ["Remote AI Platform", "/"],
          ["Remote jobs", "/remote-jobs"],
          [hub.crumb, hub.path],
        ]
      : [
          ["Remote AI Platform", "/"],
          [hub.crumb, hub.path],
        ];
  const countries = places.filter((p) => p.item.kind === "country");
  const regions = places.filter((p) => p.item.kind !== "country");
  const count = (n: number) => (n ? ` (${n.toLocaleString("en-US")})` : "");
  const faqs: Faq[] = [
    ...landingFaq(hub.subject, stats).filter((f) => f !== APPLY_FAQ),
    ...(countries.some((c) => c.total > 0)
      ? [
          {
            q: "Which countries have the most remote jobs?",
            a: `By the location their listings name: ${countries
              .slice(0, 6)
              .map((c) => `${c.item.name}${count(c.total)}`)
              .join(", ")}. One listing can name several countries.`,
          },
        ]
      : []),
    LOCATION_FAQ,
    APPLY_FAQ,
  ];
  const placeLinks = (list: typeof places) => (
    <ul className="flex flex-wrap gap-2">
      {list.map(({ item: p, total }) => (
        <li key={p.slug}>
          <Link href={`/remote-jobs/in/${p.slug}`} className={chip}>
            Remote jobs in {p.name}
            {count(total)}
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <PublicFrame wide>
      <Breadcrumbs trail={trail} />
      <h1 className="mt-3 text-3xl font-bold text-navy">{hub.heading}</h1>
      <p className="mt-2 max-w-3xl text-slate-600">{hub.lead}</p>
      {landingIntro(hub.subject, stats).map((p) => (
        <p key={p} className="mt-2 max-w-3xl text-slate-600">
          {p}
        </p>
      ))}
      {kind === "countries" ? (
        <>
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-bold">Countries</h2>
            {placeLinks(countries)}
          </section>
          {regions.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-lg font-bold">Regions and anywhere</h2>
              {placeLinks(regions)}
            </section>
          )}
        </>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-bold">
              {kind === "work-from-home" ? "Work from home jobs by role" : "Remote work by role"}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {topics.map(({ item: t, total }) => (
                <li key={t.slug}>
                  <Link href={`/remote-jobs/${t.slug}`} className={chip}>
                    {topicHeading(t)}
                    {count(total)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-bold">By country and region</h2>
            {placeLinks(places.slice(0, 20))}
            <p className="mt-3 text-sm">
              <Link href="/remote-jobs/in" className="font-semibold text-brand underline">
                All countries
              </Link>
            </p>
          </section>
        </>
      )}
      <section className="mt-8">
        <h2 className="mb-3 text-xl font-bold">Latest {hub.subject}</h2>
        <JobList jobs={latest.jobs.slice(0, kind === "work-from-home" ? 30 : 15)} />
        <p className="mt-3 text-sm">
          <Link href="/remote-jobs" className="font-semibold text-brand underline">
            Browse all remote jobs
          </Link>
        </p>
      </section>
      <JoinCta />
      <FaqSection faqs={faqs} />
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Guides</h2>
        <ul className="list-disc pl-5">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link href={`/guides/${g.slug}`} className="text-brand underline">
                {g.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <JsonLd data={breadcrumbJsonLd(site, trail)} />
    </PublicFrame>
  );
}
