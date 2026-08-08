"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useProjects, useCreateProject } from "@/hooks/useProjects";
import type { ProjectRecord } from "@/hooks/useProject";
import { useAuth } from "@/lib/auth";

export default function ProjectsPage() {
  const projects = useProjects();
  const createProject = useCreateProject();
  const router = useRouter();
  const { user } = useAuth();
  const [form, setForm] = useState({ title: "", description: "", technologies: "", timeline: "", budget: "" });
  const data = projects.data ?? [];
  const canCreate = user?.role === "COMPANY" || user?.role === "ADMIN";
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    createProject.mutate({
      title: form.title,
      description: form.description,
      technologies: form.technologies.split(",").map((item) => item.trim()).filter(Boolean),
      timeline: form.timeline || undefined,
      budget: form.budget ? Number(form.budget) : undefined,
    }, { onSuccess: (project) => router.push(`/projects/${project.id}`) });
  };

  return <main className="mx-auto max-w-6xl px-4 py-8">
    <div className="mb-6"><p className="text-sm font-medium text-[#0A66C2]">Delivery workspace</p><h1 className="text-3xl font-bold text-slate-900">Projects</h1><p className="mt-2 text-slate-600">Turn a delivery brief into a reviewable plan before work begins.</p></div>
    {canCreate && <section className="card-enterprise mb-8 p-6"><h2 className="text-lg font-semibold text-slate-900">Start a project brief</h2><p className="mt-1 text-sm text-slate-500">AI planning is a draft step. Nothing becomes active until you approve the generated plan.</p><form onSubmit={submit} className="mt-5 space-y-4"><input required value={form.title} onChange={(event) => update("title", event.target.value)} className="input-enterprise" placeholder="Project title" aria-label="Project title" /><textarea required value={form.description} onChange={(event) => update("description", event.target.value)} className="input-enterprise min-h-28" placeholder="What should be delivered? Include goals, constraints, and acceptance expectations." aria-label="Project description" /><div className="grid gap-4 sm:grid-cols-3"><input value={form.technologies} onChange={(event) => update("technologies", event.target.value)} className="input-enterprise" placeholder="Technologies (comma separated)" aria-label="Technologies" /><input value={form.timeline} onChange={(event) => update("timeline", event.target.value)} className="input-enterprise" placeholder="Timeline" aria-label="Timeline" /><input type="number" min="0" value={form.budget} onChange={(event) => update("budget", event.target.value)} className="input-enterprise" placeholder="Budget" aria-label="Budget" /></div>{createProject.isError && <p className="text-sm text-red-700">Unable to create the project. Check your company profile and try again.</p>}<button disabled={createProject.isPending} className="button-primary" type="submit">{createProject.isPending ? "Creating…" : "Create project brief"}</button></form></section>}
    {projects.isLoading ? <div className="card-enterprise h-32 animate-pulse bg-slate-100" /> : projects.error ? <div className="card-enterprise p-6"><p>Unable to load projects.</p><button className="button-primary mt-4" onClick={() => void projects.refetch()}>Retry</button></div> : data.length === 0 ? <div className="card-enterprise p-8 text-center text-slate-500">No projects are available yet.</div> : <div className="grid gap-4 md:grid-cols-2">{data.map((project: ProjectRecord) => <Link href={`/projects/${project.id}`} key={project.id} className="card-enterprise p-5 transition hover:border-[#0A66C2]"><div className="flex items-start justify-between gap-3"><h2 className="font-semibold text-slate-900">{project.title}</h2><span className="badge-enterprise">{project.status}</span></div><p className="mt-2 line-clamp-2 text-sm text-slate-600">{project.description}</p><p className="mt-4 text-xs text-slate-500">{project.timeline || "Timeline not set"}</p></Link>)}</div>}
  </main>;
}
