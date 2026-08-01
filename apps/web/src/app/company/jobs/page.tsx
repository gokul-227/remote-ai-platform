"use client";

import Link from "next/link";
import { useCompanyJobs } from "@/hooks/useCompanyJobs";
import { RequireRole } from "@/components/RequireRole";

function CompanyJobsPageContent() {
  const jobs = useCompanyJobs(true);
  return <main className="mx-auto max-w-5xl px-4 py-8"><div className="flex items-start justify-between gap-4"><div><h1 className="text-3xl font-bold text-slate-900">Company jobs</h1><p className="mt-2 text-slate-600">Manage roles and projects published by your company.</p></div><Link href="/company/dashboard" className="button-primary">Hiring Dashboard</Link></div>{jobs.isLoading ? <div className="card-enterprise mt-6 p-8 text-slate-500">Loading company jobs…</div> : jobs.isError ? <div className="card-enterprise mt-6 p-8 text-red-700">Unable to load company jobs. <button onClick={() => jobs.refetch()} className="font-semibold text-[#0A66C2]">Retry</button></div> : (jobs.data ?? []).length === 0 ? <div className="card-enterprise mt-6 p-8 text-slate-500">No jobs published yet. Create your first role from the Hiring Dashboard.</div> : <div className="mt-6 space-y-4">{jobs.data.map((job: { id: string; title: string; description: string; job_type: string }) => <Link key={job.id} href={`/jobs/${job.id}`} className="card-enterprise block p-5 hover:border-[#0A66C2]"><h2 className="font-semibold text-slate-900">{job.title}</h2><p className="mt-1 text-sm text-slate-500">{job.job_type}</p><p className="mt-3 line-clamp-2 text-sm text-slate-600">{job.description}</p></Link>)}</div>}</main>;
}

export default function CompanyJobsPage() {
  return (
    <RequireRole roles={["COMPANY", "ADMIN"]}>
      <CompanyJobsPageContent />
    </RequireRole>
  );
}
