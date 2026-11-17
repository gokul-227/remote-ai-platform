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
      <div className="min-h-screen bg-white text-charcoal">
        <SiteNav home />
        <main id="main" className="mx-auto max-w-6xl px-5 py-12 sm:py-20">
          <section className="grid grid-cols-1 items-center gap-10 lg:gap-20 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div>
              <h1 className="font-bold" style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", lineHeight: 1.12 }}>
                Find your next remote job.
              </h1>
              <p className="mt-4 max-w-xl text-lg text-slate-600">
                Discover opportunities, connect with professionals and bring your work together.
                {stats?.total ? ` Explore ${fmt(stats.total)} open remote roles.` : ""}
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
              <p className="mt-4 text-sm text-slate-500">Free to join. Built for your next step.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
              <h2 className="text-xl font-bold">Make your next move</h2>
              <p className="mt-3 text-slate-600">
                Create your free profile to connect, save opportunities and manage your work in one place.
              </p>
              <a
                href="#register"
                className="mt-6 block rounded-lg bg-brand px-5 py-3 text-center font-semibold text-white"
              >
                Create your free account
              </a>
              <p className="mt-5 text-center text-sm text-slate-600">
                Already a member?{" "}
                <a href="#login" className="font-semibold text-brand underline">
                  Sign in to your account
                </a>
              </p>
            </div>
          </section>

          <section className="mt-12" aria-labelledby="latest">
            <h2 id="latest" className="mb-4 text-2xl font-bold">
              Latest remote jobs
            </h2>
            <JobList jobs={latest.jobs.slice(0, 6)} />
            <Link href="/remote-jobs" className="mt-4 inline-block font-semibold text-brand underline">
              See all {latest.total ? fmt(latest.total) : ""} remote jobs →
            </Link>
          </section>

          <details className="mt-12 border-t border-slate-200 pt-6">
            <summary className="cursor-pointer font-semibold text-brand">Explore jobs by role and country</summary>
            <section className="mt-12">
              <h2 className="text-2xl font-bold">Remote jobs by role</h2>
              <ul className="mt-5 flex flex-wrap gap-2">
                {topics.slice(0, 12).map(({ item: t, total }) => (
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
                {places.slice(0, 10).map(({ item: p, total }) => (
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
          </details>
          <details className="mt-8 border-t border-slate-200 pt-6">
            <summary className="cursor-pointer font-semibold text-brand">Questions about finding remote work</summary>
            <FaqSection faqs={faqs} title="Remote jobs: common questions" />
          </details>
        </main>
        <PublicFooter />
        <JsonLd data={[organizationJsonLd(site, OPERATOR.contactEmail), websiteJsonLd(site)]} />
      </div>
    </AppEntry>
  );
}
