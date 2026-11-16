import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { OPERATOR } from "@/figma/legal_content";
import { AppEntry } from "./AppEntry";
import { SITE_URL } from "@/lib/site";
import { organizationJsonLd, websiteJsonLd } from "@/lib/brand";
import { fetchLandingJobs, fetchLandingStats, topicHeading } from "@/lib/landing";
import { APPLY_FAQ, LOCATION_FAQ, landingFaq, livePlaces, liveTopics } from "@/lib/hubs";
import { JsonLd, PublicFooter, SiteNav } from "./PublicChrome";
import { JobList } from "./remote-jobs/JobList";
import { FaqSection } from "./Faq";

const fmt = (n: number) => n.toLocaleString("en-US");

export async function generateMetadata(): Promise<Metadata> {
  const stats = await fetchLandingStats({});
  const n = stats?.total ? `${fmt(stats.total)} ` : "";
  const title = `Remote Jobs: ${n}work from home jobs and remote work | Remote AI Platform`;
  const description =
    `Find remote jobs and work from home jobs from employers and job boards` +
    (stats?.total ? `: ${fmt(stats.total)} open now` : "") +
    (stats?.new_last_7_days ? `, ${fmt(stats.new_last_7_days)} new this week` : "") +
    ". Browse by role, country and company. Free to join.";
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: "/" },
    openGraph: { title, description, url: "/", siteName: "Remote AI Platform", type: "website" },
  };
}

const workflows = [
  ["Connect", "Build your professional profile, find people and share updates with your network.", "/#engineers"],
  ["Find work", "Explore remote roles, save opportunities and manage your applications in one place.", "/remote-jobs"],
  ["Hire", "Publish a role, review applications and connect with professionals.", "/#postjob"],
  ["Get work done", "Bring projects, conversations, meetings and deliverables into a shared workspace.", "/#projects"],
];
const chip =
  "rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-brand hover:border-brand";

export default async function Home() {
  await connection();
  const [stats, latest, topics, places] = await Promise.all([
    fetchLandingStats({}),
    fetchLandingJobs({}),
    liveTopics(),
    livePlaces(),
  ]);
  const site = SITE_URL || "https://remoteaiplatform.com";
  const count = (n: number) => (n ? ` (${fmt(n)})` : "");
  const faqs = [...landingFaq("remote jobs", stats).filter((f) => f !== APPLY_FAQ), LOCATION_FAQ, APPLY_FAQ];
  return (
    <AppEntry>
      <div className="min-h-screen bg-mist text-charcoal">
        <SiteNav home />
        <main id="main" className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
          <section className="grid grid-cols-1 items-start gap-10 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div>
              <h1 className="font-bold" style={{ fontSize: "clamp(2.25rem, 4vw, 3.25rem)", lineHeight: 1.12 }}>
                Remote jobs
              </h1>
              <p className="mt-4 max-w-xl text-lg text-slate-600">
                {stats?.total ? `${fmt(stats.total)} remote and work-from-home jobs` : "Remote and work-from-home jobs"}{" "}
                from employers and job boards
                {stats?.new_last_7_days ? `, ${fmt(stats.new_last_7_days)} posted in the last 7 days` : ""}. Browse by
                role, country or company, then apply on the employer&apos;s own page.
              </p>
              <form action="/remote-jobs" method="get" role="search" className="mt-6 flex max-w-xl gap-2">
                <label htmlFor="home-q" className="sr-only">
                  Search remote jobs
                </label>
                <input
                  id="home-q"
                  name="q"
                  type="search"
                  placeholder="Role, skill or company"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3"
                />
                <button type="submit" className="rounded-lg bg-brand px-5 py-3 font-semibold text-white">
                  Search
                </button>
              </form>
              <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
                <Link href="/remote-jobs" className="text-brand underline">
                  All remote jobs
                </Link>
                <Link href="/work-from-home-jobs" className="text-brand underline">
                  Work from home jobs
                </Link>
                <Link href="/remote-jobs/in" className="text-brand underline">
                  Remote jobs by country
                </Link>
                <Link href="/remote-jobs/in/worldwide" className="text-brand underline">
                  Work from anywhere
                </Link>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">Your professional network and workspace</h2>
              <p className="mt-3 text-slate-600">
                A free profile gets you jobs matched to your skills, alerts for new roles and your applications in one
                place, plus people, projects and meetings when you find the work.
              </p>
              <a href="#register" className="mt-5 inline-block rounded-lg bg-brand px-5 py-3 font-semibold text-white">
                Create your free account
              </a>
            </div>
          </section>

          <section className="mt-12" aria-labelledby="latest">
            <h2 id="latest" className="mb-4 text-2xl font-bold">
              Latest remote jobs
            </h2>
            <JobList jobs={latest.jobs.slice(0, 15)} />
            <Link href="/remote-jobs" className="mt-4 inline-block font-semibold text-brand underline">
              See all {latest.total ? fmt(latest.total) : ""} remote jobs →
            </Link>
          </section>

          <section className="mt-12">
            <h2 className="text-2xl font-bold">Remote jobs by role</h2>
            <ul className="mt-5 flex flex-wrap gap-2">
              {topics.slice(0, 24).map(({ item: t, total }) => (
                <li key={t.slug}>
                  <Link href={`/remote-jobs/${t.slug}`} className={chip}>
                    {topicHeading(t)}
                    {count(total)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="mt-10">
            <h2 className="text-2xl font-bold">Remote jobs by country</h2>
            <ul className="mt-5 flex flex-wrap gap-2">
              {places.slice(0, 20).map(({ item: p, total }) => (
                <li key={p.slug}>
                  <Link href={`/remote-jobs/in/${p.slug}`} className={chip}>
                    Remote jobs in {p.name}
                    {count(total)}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/remote-jobs/in" className="mt-5 inline-block font-semibold text-brand underline">
              All countries and regions →
            </Link>
          </section>

          <section aria-label="What you can do" className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {workflows.map(([title, text, href]) => (
              <article key={title} className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="text-xl font-bold">{title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{text}</p>
                <a href={href} className="mt-4 inline-block font-semibold text-brand underline">
                  Explore {title.toLowerCase()} →
                </a>
              </article>
            ))}
          </section>
          <FaqSection faqs={faqs} title="Remote jobs: common questions" />
        </main>
        <PublicFooter />
        <JsonLd data={[organizationJsonLd(site, OPERATOR.contactEmail), websiteJsonLd(site)]} />
      </div>
    </AppEntry>
  );
}
