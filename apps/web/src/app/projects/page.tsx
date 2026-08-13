"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderKanban, Plus, Sparkles, Clock, ChevronRight, LayoutGrid, List,
} from "lucide-react";
import { useProjects, useCreateProject } from "@/hooks/useProjects";
import type { ProjectRecord } from "@/hooks/useProject";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea, SearchInput } from "@/components/ui/Input";
import { StatusBadge, type StatusTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

const STATUS_TONE: Record<string, StatusTone> = {
  PLANNING: "info", ACTIVE: "success", PAUSED: "warning", COMPLETED: "neutral", CANCELLED: "danger",
};
const STATUS_LABEL: Record<string, string> = {
  PLANNING: "Planning", ACTIVE: "Active", PAUSED: "Paused", COMPLETED: "Completed", CANCELLED: "Cancelled",
};

function CreateProjectModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const createProject = useCreateProject();
  const [form, setForm] = useState({ title: "", description: "", technologies: "", timeline: "", budget: "" });
  const canSubmit = form.title.trim() && form.description.trim();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    createProject.mutate({
      title: form.title,
      description: form.description,
      technologies: form.technologies.split(",").map((t) => t.trim()).filter(Boolean),
      timeline: form.timeline || undefined,
      budget: form.budget ? Number(form.budget) : undefined,
    }, { onSuccess: (project: ProjectRecord) => { onClose(); onCreated(project.id); } });
  };

  return (
    <Modal open={open} onClose={onClose} title="Start a Project Brief" size="lg">
      <p className="text-sm text-slate-500 mb-4">AI planning generates a draft — you approve before work begins.</p>
      <form onSubmit={submit} className="space-y-4">
        <Input label="Project Title" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. E-commerce Platform MVP" />
        <Textarea label="Description" required rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What should be delivered? Include goals, constraints, and acceptance criteria…" />
        <div className="grid grid-cols-3 gap-3">
          <Input label="Tech Stack" value={form.technologies} onChange={(e) => setForm((f) => ({ ...f, technologies: e.target.value }))} placeholder="Python, React…" />
          <Input label="Timeline" value={form.timeline} onChange={(e) => setForm((f) => ({ ...f, timeline: e.target.value }))} placeholder="6 weeks" />
          <Input label="Budget (USD)" type="number" min={0} value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} placeholder="5000" />
        </div>
        {createProject.isError && <p className="text-xs text-red-600">Unable to create project. Check your company profile and try again.</p>}
        <Button type="submit" fullWidth size="lg" disabled={!canSubmit} loading={createProject.isPending} icon={<Sparkles className="h-4 w-4" />}>
          Create & Generate Plan
        </Button>
      </form>
    </Modal>
  );
}

function ProjectCard({ project }: { project: ProjectRecord }) {
  return (
    <Link href={`/projects/${project.id}`} className="card-enterprise p-5 flex flex-col gap-3 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900 truncate flex-1">{project.title}</h2>
        <StatusBadge label={STATUS_LABEL[project.status] ?? project.status} tone={STATUS_TONE[project.status] ?? "neutral"} />
      </div>
      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{project.description}</p>
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        {project.timeline ? (
          <span className="flex items-center gap-1 text-xs text-slate-400"><Clock className="h-3 w-3" />{project.timeline}</span>
        ) : (
          <span className="text-xs text-slate-300">No timeline set</span>
        )}
        <span className="flex items-center gap-1 text-xs font-semibold text-[#0A66C2]">View Details <ChevronRight className="h-3.5 w-3.5" /></span>
      </div>
    </Link>
  );
}

function ProjectRow({ project }: { project: ProjectRecord }) {
  return (
    <Link href={`/projects/${project.id}`} className="flex items-center gap-4 p-3.5 rounded-xl border border-[var(--border-color)] hover:border-slate-300 hover:bg-slate-50 transition-colors">
      <div className="h-9 w-9 rounded-lg bg-[var(--color-ai-soft)] flex items-center justify-center shrink-0">
        <FolderKanban className="h-4 w-4 text-[var(--color-ai)]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900 truncate">{project.title}</div>
        <div className="text-xs text-slate-500 truncate mt-0.5">{project.description}</div>
      </div>
      {project.timeline && <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0"><Clock className="h-3 w-3" />{project.timeline}</span>}
      <StatusBadge label={STATUS_LABEL[project.status] ?? project.status} tone={STATUS_TONE[project.status] ?? "neutral"} />
      <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
    </Link>
  );
}

export default function ProjectsPage() {
  return (
    <RequireAuth>
      <ProjectsContent />
    </RequireAuth>
  );
}

function ProjectsContent() {
  const projects = useProjects();
  const router = useRouter();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showCreate, setShowCreate] = useState(false);

  const canCreate = user?.role === "COMPANY" || user?.role === "ADMIN";
  const data = (projects.data ?? []) as ProjectRecord[];

  const filtered = data.filter((p) => {
    const matchesSearch = !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statuses = ["all", ...Array.from(new Set(data.map((p) => p.status)))];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Projects</h1>
          <p className="text-xs text-slate-500 mt-1">AI-planned delivery briefs with milestone tracking and work dispatch.</p>
        </div>
        {canCreate && (
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>New Project</Button>
        )}
      </div>

      {data.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: data.length },
            { label: "Active", value: data.filter((p) => p.status === "ACTIVE").length },
            { label: "Planning", value: data.filter((p) => p.status === "PLANNING").length },
            { label: "Completed", value: data.filter((p) => p.status === "COMPLETED").length },
          ].map(({ label, value }) => (
            <div key={label} className="card-enterprise p-4 text-center">
              <div className="text-xl font-bold text-slate-900">{value}</div>
              <div className="text-[11px] text-slate-500 font-medium mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects…" className="max-w-xs" />
        <div className="flex gap-1.5 flex-wrap">
          {statuses.map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className="cursor-pointer">
              <StatusBadge label={s === "all" ? "All" : (STATUS_LABEL[s] ?? s)} tone={statusFilter === s ? "info" : "neutral"} />
            </button>
          ))}
        </div>
        <div className="flex border border-[var(--border-color)] rounded-lg overflow-hidden ml-auto">
          {([["grid", LayoutGrid], ["list", List]] as const).map(([mode, Icon]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn("p-2", viewMode === mode ? "bg-[var(--color-brand-light)] text-[#0A66C2]" : "text-slate-400")}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      {projects.isLoading ? (
        <div className={viewMode === "grid" ? "grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3" : "space-y-2"}>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-enterprise">
          <EmptyState
            icon={FolderKanban}
            title={data.length === 0 ? "No projects yet" : "No projects match your filters"}
            description={
              data.length === 0
                ? canCreate ? "Create your first project brief and let AI build the plan." : "No projects available yet."
                : "Try changing your search or status filter."
            }
            actionLabel={canCreate && data.length === 0 ? "Create First Project" : undefined}
            onAction={canCreate && data.length === 0 ? () => setShowCreate(true) : undefined}
          />
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => <ProjectRow key={p.id} project={p} />)}
        </div>
      )}

      <CreateProjectModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={(id) => router.push(`/projects/${id}`)} />
    </div>
  );
}
