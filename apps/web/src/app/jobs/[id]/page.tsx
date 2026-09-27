import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RichText } from "@/figma/richtext";
import { fetchPublicJob, summary } from "@/lib/site";

/**
 * Public, server-rendered job page: what crawlers and link previews see, and
 * a shareable address. Applying and everything else happens in the app.
 */
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = await fetchPublicJob((await params).id);
  if (!job) return { title: "Job not found | Remote AI Platform", robots: { index: false } };
  const title = `${job.title} at ${job.company_name} | Remote AI Platform`;
  const description = summary(job.description || `${job.title} at ${job.company_name}`);
  return {
    title,
    description,
    alternates: { canonical: `/jobs/${job.id}` },
    // A listing its source no longer shows stays reachable but isn't promoted.
    robots: job.expired_at ? { index: false, follow: true } : undefined,
    openGraph: { title, description, type: "article", url: `/jobs/${job.id}` },
  };
}

export default async function JobPage({ params }: Props) {
  const job = await fetchPublicJob((await params).id);
  if (!job) notFound();
  const where = job.location || (job.is_remote ? "Remote" : "On-site");
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-[#1c1e21]">
      <Link href="/#jobs" className="text-sm font-semibold text-[#0552CC]">
        ← All remote jobs
      </Link>
      <p className="mt-6 text-sm font-semibold text-slate-600">{job.company_name}</p>
      <h1 className="mt-1 text-3xl font-bold">{job.title}</h1>
      <p className="mt-1 text-slate-600">
        {where}
        {job.posted_at ? ` · posted ${new Date(job.posted_at).toISOString().slice(0, 10)}` : ""}
        {job.company_id ? "" : " · listed from another job board"}
      </p>
      {job.expired_at && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          This listing is over a month old and may no longer be open.
        </p>
      )}
      <p className="mt-6">
        <a
          href={`/#jobdetail/${job.id}`}
          className="inline-flex rounded-full bg-[#0552CC] px-5 py-2.5 font-semibold text-white"
        >
          View and apply
        </a>
      </p>
      <section className="mt-8">
        <h2 className="mb-3 text-xl font-bold">About the job</h2>
        <RichText text={job.description || "No description provided."} />
      </section>
    </main>
  );
}
