import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_URL } from "@/lib/site";
import { TOPICS, fetchTopicJobs, topicBySlug } from "@/lib/seo";
import { JobList, JoinCta } from "../JobList";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ topic: string }> };

const heading = (name: string, jobType?: string) => (jobType ? `${name} remote jobs` : `Remote ${name} jobs`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const topic = topicBySlug((await params).topic);
  if (!topic) return { title: "Not found | Remote AI Platform", robots: { index: false } };
  const { total } = await fetchTopicJobs(topic, 1);
  const title = `${heading(topic.name, topic.jobType)} (${total}) | Remote AI Platform`;
  const description = `${total} open ${heading(topic.name, topic.jobType).toLowerCase()} from leading companies and job boards, updated every few hours. Apply or get AI-matched for free.`;
  return {
    title,
    description,
    alternates: { canonical: `/remote-jobs/${topic.slug}` },
    // An empty category isn't worth a search result until it has roles.
    robots: total ? undefined : { index: false, follow: true },
    openGraph: { title, description, url: `/remote-jobs/${topic.slug}` },
  };
}

export default async function TopicPage({ params }: Props) {
  const topic = topicBySlug((await params).topic);
  if (!topic) notFound();
  const { jobs, total } = await fetchTopicJobs(topic, 50);
  const live = jobs.filter((j) => !j.expired_at);
  const related = TOPICS.filter((t) => t.group === topic.group && t.slug !== topic.slug).slice(0, 10);
  const title = heading(topic.name, topic.jobType);
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 text-[#1c1e21]">
      <nav className="text-sm text-slate-500">
        <Link href="/" className="hover:underline">
          Remote AI Platform
        </Link>{" "}
        ›{" "}
        <Link href="/remote-jobs" className="hover:underline">
          Remote jobs
        </Link>{" "}
        › {topic.name}
      </nav>
      <h1 className="mt-3 text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-slate-600">
        {total} open roles, newest first. Every listing links to the employer or original job board.
      </p>
      <div className="mt-6">
        <JobList jobs={live} />
      </div>
      <JoinCta />
      {related.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Related categories</h2>
          <div className="flex flex-wrap gap-2">
            {related.map((t) => (
              <Link
                key={t.slug}
                href={`/remote-jobs/${t.slug}`}
                className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm hover:border-[#0552CC] hover:text-[#0552CC]"
              >
                {heading(t.name, t.jobType)}
              </Link>
            ))}
          </div>
        </section>
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Remote AI Platform", item: `${SITE_URL}/` },
                { "@type": "ListItem", position: 2, name: "Remote jobs", item: `${SITE_URL}/remote-jobs` },
                { "@type": "ListItem", position: 3, name: title, item: `${SITE_URL}/remote-jobs/${topic.slug}` },
              ],
            },
            {
              "@context": "https://schema.org",
              "@type": "ItemList",
              itemListElement: live.map((j, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: `${SITE_URL}/jobs/${j.id}`,
              })),
            },
          ]).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
