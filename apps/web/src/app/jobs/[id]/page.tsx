import type { Metadata } from "next";
import { ShareButtons } from "@/figma/ShareButtons";
import { socialMetadata } from "@/lib/share";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RichText } from "@/figma/richtext";
import { SITE_URL, fetchPublicJob, jobHighlights, jobPostingJsonLd, summary } from "@/lib/site";
import { permitsGoogleJobs, jobSourceName, originalJobUrl } from "@/lib/jobSources";
import { PLACES, placeMatches, topicsForJob } from "@/lib/seo";
import { fetchLandingJobs, topicFilter, topicHeading } from "@/lib/landing";
import { JobList } from "../../remote-jobs/JobList";

const employerSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
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
  // Location in the title keeps reposted roles (same title, same employer) distinct.
  const where = job.location || (job.is_remote ? "Remote" : "");
  const base = `${job.title} at ${job.company_name}`;
  const title = `${where && base.length + where.length < 75 ? `${base} (${where})` : base} | Remote AI Platform`;
  const lead = `${base}${where ? `, ${where}` : ""}. `;
  const description = summary(lead + (job.description || ""));
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
  const highlights = jobHighlights(job);
  const topics = topicsForJob(job);
  // Hub and spoke: home → all jobs → the job's main category → the job.
  const trail: [string, string][] = [
    ["Remote AI Platform", "/"],
    ["Remote jobs", "/remote-jobs"],
    ...(topics[0] ? [[topicHeading(topics[0]), `/remote-jobs/${topics[0].slug}`] as [string, string]] : []),
    [job.title, `/jobs/${job.id}`],
  ];
  const places = PLACES.filter((p) => placeMatches(p, job.location)).slice(0, 3);
  const [sameEmployer, sameTopic] = await Promise.all([
    fetchLandingJobs({ employer: job.company_name }),
    topics[0] ? fetchLandingJobs(topicFilter(topics[0])) : Promise.resolve({ jobs: [], total: 0 }),
  ]);
  const others = (list: typeof sameEmployer.jobs) => list.filter((j) => j.id !== job.id).slice(0, 5);
  const employerJobs = others(sameEmployer.jobs);
  const related = others(sameTopic.jobs.filter((j) => !employerJobs.some((e) => e.id === j.id)));
  return (
    <PublicFrame>
      {!job.expired_at && permitsGoogleJobs(job.source) && <JsonLd data={jobPostingJsonLd(job, site)} />}
      <JsonLd data={breadcrumbJsonLd(site, trail)} />
      <Breadcrumbs trail={trail} />
      <article className="mt-4 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <p className="text-sm font-semibold text-slate-600">
          {job.company_id ? (
            <Link href={`/companies/${job.company_id}`} className="hover:text-brand hover:underline">
              {job.company_name}
            </Link>
          ) : (
            job.company_name
          )}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-navy">{job.title}</h1>
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
              className="font-semibold text-brand underline"
            >
              {jobSourceName(job.source)} — view original listing and apply
            </a>
            . No platform account required.
          </p>
        )}
        <p className="mt-6">
          <a
            href={`/#jobdetail/${job.id}`}
            className="inline-flex rounded-full bg-brand px-5 py-2.5 font-semibold text-white hover:bg-brand-hover"
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
        {highlights.length > 0 && (
          <section className="mt-8 rounded-lg bg-slate-50 p-4" aria-labelledby="job-glance">
            <h2 id="job-glance" className="mb-2 text-lg font-bold">
              At a glance
            </h2>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
              {highlights.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-semibold text-slate-700">{k}</dt>
                  <dd className="text-slate-700">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        <section className="mt-8" aria-labelledby="about-job">
          <h2 id="about-job" className="mb-3 text-xl font-bold">
            About the job
          </h2>
          <RichText text={job.description || "No description provided."} />
        </section>
      </article>
      {employerJobs.length > 0 && (
        <section className="mt-8" aria-labelledby="employer-jobs">
          <h2 id="employer-jobs" className="mb-3 text-lg font-bold">
            More remote jobs at {job.company_name}
          </h2>
          <JobList jobs={employerJobs} />
          {sameEmployer.total > 2 && (
            <p className="mt-2 text-sm">
              <Link href={`/remote-jobs/at/${employerSlug(job.company_name)}`} className="text-brand underline">
                All {sameEmployer.total} remote jobs at {job.company_name}
              </Link>
            </p>
          )}
        </section>
      )}
      {related.length > 0 && (
        <section className="mt-8" aria-labelledby="related-jobs">
          <h2 id="related-jobs" className="mb-3 text-lg font-bold">
            Related jobs
          </h2>
          <JobList jobs={related} />
        </section>
      )}
      {(topics.length > 0 || places.length > 0) && (
        <section className="mt-8" aria-labelledby="similar-jobs">
          <h2 id="similar-jobs" className="mb-3 text-lg font-bold">
            More jobs like this
          </h2>
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => (
              <Link
                key={t.slug}
                href={`/remote-jobs/${t.slug}`}
                className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm hover:border-brand hover:text-brand"
              >
                {t.jobType ? `${t.name} remote jobs` : `Remote ${t.name} jobs`}
              </Link>
            ))}
            {places.map((p) => (
              <Link
                key={p.slug}
                href={`/remote-jobs/in/${p.slug}`}
                className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm hover:border-brand hover:text-brand"
              >
                Remote jobs in {p.name}
              </Link>
            ))}
          </div>
        </section>
      )}
      <div className="mt-8 rounded-xl bg-navy p-6 text-white">
        <p className="text-lg font-bold">Get matched to jobs like this</p>
        <p className="mt-1 text-sm text-[#DCE8FF]">Free profile, one-click applications, and alerts for new roles.</p>
        <Link href="/#register" className="mt-4 inline-flex rounded-full bg-white px-5 py-2 font-semibold text-navy">
          Join free
        </Link>
      </div>
    </PublicFrame>
  );
}
