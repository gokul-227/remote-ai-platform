"use client";

import { useParams } from "next/navigation";
import { useProject, type MilestoneRecord, type TaskRecord } from "@/hooks/useProject";

export default function ProjectWorkspacePage() {
  const params = useParams<{ id: string }>();
  const project = useProject(params.id);

  if (project.isLoading) return <main className="mx-auto max-w-6xl px-4 py-10"><div className="card-enterprise h-40 animate-pulse bg-slate-100" /></main>;
  if (project.error) return <main className="mx-auto max-w-6xl px-4 py-10"><div className="card-enterprise p-6"><p className="text-slate-700">Unable to load this project.</p><button className="button-primary mt-4" onClick={() => void project.refetch()}>Retry</button></div></main>;
  if (!project.data) return <main className="mx-auto max-w-6xl px-4 py-10"><div className="card-enterprise p-6 text-slate-500">Project details are unavailable.</div></main>;

  const { project: details, milestones = [], tasks = [] } = project.data;
  return <main className="mx-auto max-w-6xl px-4 py-8">
    <section className="card-enterprise p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-[#0A66C2]">Project workspace</p><h1 className="mt-1 text-3xl font-bold text-slate-900">{details.title}</h1><p className="mt-2 max-w-3xl text-slate-600">{details.description}</p></div><span className="badge-enterprise">{details.status}</span></div>
      <div className="mt-6 grid gap-4 text-sm text-slate-600 sm:grid-cols-3"><div><span className="font-semibold text-slate-900">Timeline</span><br />{details.timeline || "Not set"}</div><div><span className="font-semibold text-slate-900">Milestones</span><br />{milestones.length}</div><div><span className="font-semibold text-slate-900">Tasks</span><br />{tasks.length}</div></div>
    </section>
    <div className="mt-6 grid gap-6 lg:grid-cols-2"><section className="card-enterprise p-6"><h2 className="text-lg font-semibold text-slate-900">Milestones</h2><div className="mt-4 space-y-3">{milestones.length ? milestones.map((item: MilestoneRecord) => <div key={item.id} className="border-b border-slate-100 pb-3"><p className="font-medium text-slate-900">{item.title}</p><p className="text-sm text-slate-500">{item.description || "No description"}</p></div>) : <p className="text-sm text-slate-500">No milestones yet.</p>}</div></section><section className="card-enterprise p-6"><h2 className="text-lg font-semibold text-slate-900">Tasks</h2><div className="mt-4 space-y-3">{tasks.length ? tasks.map((item: TaskRecord) => <div key={item.id} className="flex items-center justify-between border-b border-slate-100 pb-3"><div><p className="font-medium text-slate-900">{item.title}</p><p className="text-sm text-slate-500">{item.milestone || "General task"}</p></div><span className="text-xs font-semibold text-slate-500">{item.status}</span></div>) : <p className="text-sm text-slate-500">No tasks yet.</p>}</div></section></div>
  </main>;
}
