"use client";

import { useJobs } from "@/hooks/useJobs";

export default function RecommendationsPage() {
  const jobs = useJobs();
  return <main className="mx-auto max-w-5xl px-4 py-8"><h1 className="text-3xl font-bold text-slate-900">Recommended opportunities</h1><p className="mt-2 text-slate-600">Roles selected from your profile and marketplace preferences.</p>{jobs.isLoading ? <div className="card-enterprise mt-6 p-8 text-slate-500">Loading recommendations…</div> : jobs.isError ? <div className="card-enterprise mt-6 p-8 text-red-700">Recommendations are temporarily unavailable. <button onClick={() => jobs.refetch()} className="font-semibold text-[#0A66C2]">Retry</button></div> : <div className="mt-6 space-y-4">{(jobs.data ?? []).length === 0 ? <div className="card-enterprise p-8 text-slate-500">No matching opportunities yet. Complete your profile to improve recommendations.</div> : (jobs.data ?? []).map((job: { id: string; title: string; company_name: string; location?: string }) => <article key={job.id} className="card-enterprise p-5"><h2 className="font-semibold text-slate-900">{job.title}</h2><p className="mt-1 text-sm text-slate-500">{job.company_name} · {job.location || "Remote"}</p></article>)}</div>}</main>;
}
