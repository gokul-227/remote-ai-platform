import Link from "next/link";
import type { PublicJob } from "@/lib/site";

/** Server-rendered list of job links for landing pages (crawlable, no JavaScript needed). */
export function JobList({ jobs }: { jobs: PublicJob[] }) {
  if (!jobs.length)
    return <p className="text-slate-600">No open roles in this category right now — check back soon.</p>;
  return (
    <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
      {jobs.map((j) => (
        <li key={j.id} className="p-4 hover:bg-slate-50">
          <Link href={`/jobs/${j.id}`} className="font-semibold text-[#0552CC] hover:underline">
            {j.title}
          </Link>
          <p className="text-sm text-slate-600">
            {j.company_name} · {j.location || (j.is_remote ? "Remote" : "On-site")}
            {j.posted_at ? ` · ${new Date(j.posted_at).toISOString().slice(0, 10)}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function JoinCta() {
  return (
    <div className="my-8 rounded-xl bg-[#0552CC] p-6 text-white">
      <p className="text-lg font-bold">Get matched to jobs like these</p>
      <p className="mt-1 text-sm text-blue-100">
        Create a free profile: AI-matched jobs and freelance work, one-click applications, and alerts.
      </p>
      <Link href="/#register" className="mt-4 inline-flex rounded-full bg-white px-5 py-2 font-semibold text-[#0552CC]">
        Join free
      </Link>
    </div>
  );
}
