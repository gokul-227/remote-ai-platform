import type { Metadata } from "next";
import { ShareButtons } from "@/figma/ShareButtons";
import { socialMetadata } from "@/lib/share";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RichText } from "@/figma/richtext";
import { SITE_URL, fetchPublicJob, jobPostingJsonLd, summary } from "@/lib/site";
import { permitsGoogleJobs, jobSourceName, originalJobUrl } from "@/lib/jobSources";
import { topicsForJob } from "@/lib/seo";
import { breadcrumbJsonLd } from "@/lib/brand";
import { Breadcrumbs, JsonLd, PublicFrame } from "../../PublicChrome";

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
    robots: job.expired_at || !permitsGoogleJobs(job.source) ? { index: false, follow: true } : undefined,
    ...socialMetadata({ title, description, path: `/jobs/${job.id}`, type: "article" }),
  };
}

export default async function JobPage({ params }: Props) {
  const job = await fetchPublicJob((await params).id);
  if (!job) notFound();
  const where = job.location || (job.is_remote ? "Remote" : "On-site");
  const site = SITE_URL || "https://remoteaiplatform.com";
  const trail: [string, string][] = [
    ["Remote AI Platform", "/"],
    ["Remote jobs", "/remote-jobs"],
    [job.title, `/jobs/${job.id}`],
  ];
  const topics = topicsForJob(job);
  return (
    <PublicFrame>
      {!job.expired_at && permitsGoogleJobs(job.source) && <JsonLd data={jobPostingJsonLd(job, site)} />}
      <JsonLd data={breadcrumbJsonLd(site, trail)} />
      <Breadcrumbs trail={trail} />
      <article className="mt-4 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <p className="text-sm font-semibold text-slate-600">
          {job.company_id ? (
            <Link href={`/companies/${job.company_id}`} className="hover:text-[#175CD3] hover:underline">
              {job.company_name}
            </Link>
          ) : (
            job.company_name
          )}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-[#102A43]">{job.title}</h1>
        <p className="mt-1 text-slate-600">
          {where}
          {job.posted_at ? ` · posted ${new Date(job.posted_at).toISOString().slice(0, 10)}` : ""}
          {job.company_id ? "" : " · listed from another job board"}
        </p>
        {job.expired_at && (
          <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            This job is no longer available: its source stopped listing it or it was posted more than 90 days ago.
          </p>
        )}
        {originalJobUrl(job.external_url) && (
          <p className="mt-4 text-sm text-slate-600">
            Source:{" "}
            <a
              href={originalJobUrl(job.external_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#175CD3] underline"
            >
              {jobSourceName(job.source)} — view original listing and apply
            </a>
            . No platform account required.
          </p>
        )}
        <p className="mt-6">
          <a
            href={`/#jobdetail/${job.id}`}
            className="inline-flex rounded-full bg-[#175CD3] px-5 py-2.5 font-semibold text-white hover:bg-[#124BAD]"
          >
            View and apply
          </a>
        </p>
        <div className="mt-4">
          <ShareButtons
            url={`${site}/jobs/${job.id}`}
            title={`${job.title} at ${job.company_name}`}
            label="Share this job"
          />
        </div>
        <section className="mt-8" aria-labelledby="about-job">
          <h2 id="about-job" className="mb-3 text-xl font-bold">
            About the job
          </h2>
          <RichText text={job.description || "No description provided."} />
        </section>
      </article>
      {topics.length > 0 && (
        <section className="mt-8" aria-labelledby="similar-jobs">
          <h2 id="similar-jobs" className="mb-3 text-lg font-bold">
            More jobs like this
          </h2>
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => (
              <Link
                key={t.slug}
                href={`/remote-jobs/${t.slug}`}
                className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm hover:border-[#175CD3] hover:text-[#175CD3]"
              >
                {t.jobType ? `${t.name} remote jobs` : `Remote ${t.name} jobs`}
              </Link>
            ))}
          </div>
        </section>
      )}
      <div className="mt-8 rounded-xl bg-[#102A43] p-6 text-white">
        <p className="text-lg font-bold">Get matched to jobs like this</p>
        <p className="mt-1 text-sm text-[#DCE8FF]">Free profile, one-click applications, and alerts for new roles.</p>
        <Link
          href="/#register"
          className="mt-4 inline-flex rounded-full bg-white px-5 py-2 font-semibold text-[#102A43]"
        >
          Join free
        </Link>
      </div>
    </PublicFrame>
  );
}
