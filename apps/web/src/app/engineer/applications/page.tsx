"use client";

import { useApplications } from "@/hooks/useApplications";

export default function ApplicationsPage() {
  const applications = useApplications(true);
  const items = applications.data ?? [];
  return <main className="mx-auto max-w-5xl px-4 py-8"><h1 className="text-3xl font-bold text-slate-900">Applications</h1><p className="mt-2 text-slate-600">Track the opportunities you have expressed interest in.</p>{applications.isLoading ? <div className="card-enterprise mt-6 p-8 text-slate-500">Loading applications…</div> : applications.isError ? <div className="card-enterprise mt-6 p-8 text-red-700">Unable to load applications. <button onClick={() => applications.refetch()} className="font-semibold text-[#0A66C2]">Retry</button></div> : items.length === 0 ? <div className="card-enterprise mt-6 p-8 text-slate-500">You have not applied to any opportunities yet.</div> : <div className="mt-6 space-y-4">{items.map((item: { application: { id: string; status: string }; job: { title: string; company_name: string } }) => <article key={item.application.id} className="card-enterprise p-5"><h2 className="font-semibold text-slate-900">{item.job.title}</h2><p className="mt-1 text-sm text-slate-500">{item.job.company_name}</p><span className="badge-enterprise mt-3 inline-flex">{item.application.status}</span></article>)}</div>}</main>;
}
