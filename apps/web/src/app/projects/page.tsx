"use client";

import Link from "next/link";
import { useProjects } from "@/hooks/useProjects";
import type { ProjectRecord } from "@/hooks/useProject";

export default function ProjectsPage() {
  const projects = useProjects();
  const data = projects.data ?? [];
  return <main className="mx-auto max-w-6xl px-4 py-8"><div className="mb-6"><p className="text-sm font-medium text-[#0A66C2]">Delivery workspace</p><h1 className="text-3xl font-bold text-slate-900">Projects</h1><p className="mt-2 text-slate-600">Track milestones, tasks, and delivery progress.</p></div>{projects.isLoading ? <div className="card-enterprise h-32 animate-pulse bg-slate-100" /> : projects.error ? <div className="card-enterprise p-6"><p>Unable to load projects.</p><button className="button-primary mt-4" onClick={() => void projects.refetch()}>Retry</button></div> : data.length === 0 ? <div className="card-enterprise p-8 text-center text-slate-500">No projects are available yet.</div> : <div className="grid gap-4 md:grid-cols-2">{data.map((project: ProjectRecord) => <Link href={`/projects/${project.id}`} key={project.id} className="card-enterprise p-5 transition hover:border-[#0A66C2]"><div className="flex items-start justify-between gap-3"><h2 className="font-semibold text-slate-900">{project.title}</h2><span className="badge-enterprise">{project.status}</span></div><p className="mt-2 line-clamp-2 text-sm text-slate-600">{project.description}</p><p className="mt-4 text-xs text-slate-500">{project.timeline || "Timeline not set"}</p></Link>)}</div>}</main>;
}
