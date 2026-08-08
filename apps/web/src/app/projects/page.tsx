"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderKanban,
  Plus,
  Sparkles,
  Clock,
  DollarSign,
  Code,
  ChevronRight,
  Search,
  LayoutGrid,
  List,
  CheckCircle,
  Circle,
  AlertTriangle,
  Briefcase,
  X,
} from "lucide-react";
import { useProjects, useCreateProject } from "@/hooks/useProjects";
import type { ProjectRecord } from "@/hooks/useProject";
import { useAuth } from "@/lib/auth";

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  PLANNING: { label: "Planning", color: "#38bdf8", bg: "rgba(56,189,248,0.1)", icon: Clock },
  ACTIVE: { label: "Active", color: "#34d399", bg: "rgba(52,211,153,0.1)", icon: CheckCircle },
  PAUSED: { label: "Paused", color: "#facc15", bg: "rgba(250,204,21,0.1)", icon: AlertTriangle },
  COMPLETED: { label: "Completed", color: "#a78bfa", bg: "rgba(167,139,250,0.1)", icon: CheckCircle },
  CANCELLED: { label: "Cancelled", color: "#f87171", bg: "rgba(248,113,113,0.1)", icon: X },
};

function StatusBadge({ status }: { status: string }) {
  const conf = STATUS_CONFIG[status] ?? STATUS_CONFIG.PLANNING;
  const Icon = conf.icon;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 20, background: conf.bg, border: `1px solid ${conf.color}33` }}>
      <Icon size={11} color={conf.color} />
      <span style={{ fontSize: 11, fontWeight: 700, color: conf.color }}>{conf.label}</span>
    </div>
  );
}

// ── Create Modal ──────────────────────────────────────────────────────────────
function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const createProject = useCreateProject();
  const [form, setForm] = useState({ title: "", description: "", technologies: "", timeline: "", budget: "" });

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

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    color: "#e2e8f0",
    fontSize: 13,
    padding: "10px 14px",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={onClose}>
      <div style={{ background: "linear-gradient(180deg, #0f1629 0%, #0a0f1e 100%)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, width: "min(560px, 100%)", padding: 32, boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", margin: 0 }}>Start a Project Brief</h2>
            <p style={{ fontSize: 13, color: "#475569", margin: "4px 0 0" }}>AI planning generates a draft — you approve before work begins</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}><X size={20} /></button>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Project Title *</label>
            <input style={inputStyle} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. E-commerce Platform MVP" required />
          </div>

          <div>
            <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Description *</label>
            <textarea style={{ ...inputStyle, resize: "none" }} rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What should be delivered? Include goals, constraints, and acceptance criteria…" required />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Tech Stack</label>
              <input style={inputStyle} value={form.technologies} onChange={(e) => setForm((f) => ({ ...f, technologies: e.target.value }))} placeholder="Python, React, …" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Timeline</label>
              <input style={inputStyle} value={form.timeline} onChange={(e) => setForm((f) => ({ ...f, timeline: e.target.value }))} placeholder="e.g. 6 weeks" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Budget (USD)</label>
              <input type="number" min="0" style={inputStyle} value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} placeholder="5000" />
            </div>
          </div>

          {createProject.isError && (
            <div style={{ color: "#f87171", fontSize: 13, padding: "10px 14px", background: "rgba(248,113,113,0.08)", borderRadius: 10, border: "1px solid rgba(248,113,113,0.2)" }}>
              Unable to create project. Check your company profile and try again.
            </div>
          )}

          <button
            type="submit"
            disabled={!form.title.trim() || !form.description.trim() || createProject.isPending}
            style={{
              width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
              background: (form.title.trim() && form.description.trim()) ? "linear-gradient(135deg, #7c3aed, #4f46e5)" : "rgba(255,255,255,0.05)",
              color: (form.title.trim() && form.description.trim()) ? "#fff" : "#475569",
              fontSize: 15, fontWeight: 700, cursor: (form.title.trim() && form.description.trim()) ? "pointer" : "not-allowed",
              marginTop: 8, transition: "all 0.2s",
              boxShadow: (form.title.trim() && form.description.trim()) ? "0 8px 24px rgba(124,58,237,0.3)" : "none",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <Sparkles size={16} />
            {createProject.isPending ? "Creating with AI…" : "Create & Generate Plan"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Project Card ──────────────────────────────────────────────────────────────
function ProjectCard({ project }: { project: ProjectRecord }) {
  const conf = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.PLANNING;

  return (
    <Link
      href={`/projects/${project.id}`}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 16,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        textDecoration: "none",
        transition: "all 0.2s",
      }}
      className="project-card"
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", margin: 0, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {project.title}
          </h2>
        </div>
        <StatusBadge status={project.status} />
      </div>

      <p style={{ fontSize: 13, color: "#64748b", margin: 0, lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {project.description}
      </p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        {project.timeline ? (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#475569" }}>
            <Clock size={12} />{project.timeline}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: "#334155" }}>No timeline set</span>
        )}
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#a78bfa", fontWeight: 600 }}>
          View Details <ChevronRight size={13} />
        </span>
      </div>
    </Link>
  );
}

// ── Row view ──────────────────────────────────────────────────────────────────
function ProjectRow({ project }: { project: ProjectRecord }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 20px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        textDecoration: "none",
        transition: "all 0.2s",
      }}
      className="project-row"
    >
      <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(167,139,250,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <FolderKanban size={16} color="#a78bfa" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{project.title}</div>
        <div style={{ fontSize: 12, color: "#475569", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{project.description}</div>
      </div>
      {project.timeline && (
        <span style={{ fontSize: 12, color: "#475569", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <Clock size={11} />{project.timeline}
        </span>
      )}
      <StatusBadge status={project.status} />
      <ChevronRight size={16} color="#334155" />
    </Link>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
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
    <>
      <style>{`
        .project-card:hover { border-color: rgba(167,139,250,0.25) !important; background: rgba(255,255,255,0.05) !important; transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
        .project-row:hover { border-color: rgba(167,139,250,0.2) !important; background: rgba(255,255,255,0.04) !important; }
        input:focus, textarea:focus { border-color: rgba(167,139,250,0.4) !important; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#080e1c", fontFamily: "'Inter', system-ui, sans-serif", color: "#e2e8f0" }}>
        {/* Header */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "24px 32px 0" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <p style={{ fontSize: 12, color: "#7c3aed", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px" }}>Delivery Workspace</p>
                <h1 style={{ fontSize: 28, fontWeight: 900, color: "#f1f5f9", margin: "0 0 6px", letterSpacing: "-0.02em" }}>Projects</h1>
                <p style={{ fontSize: 14, color: "#475569", margin: 0 }}>AI-planned delivery briefs with milestone tracking and work dispatch</p>
              </div>
              {canCreate && (
                <button
                  id="create-project-btn"
                  onClick={() => setShowCreate(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 12,
                    border: "none", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "#fff",
                    fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 20px rgba(124,58,237,0.35)",
                    transition: "all 0.2s", flexShrink: 0,
                  }}
                >
                  <Plus size={16} />New Project
                </button>
              )}
            </div>

            {/* Stats row */}
            {data.length > 0 && (
              <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
                {[
                  { label: "Total", value: data.length, color: "#a78bfa" },
                  { label: "Active", value: data.filter((p) => p.status === "ACTIVE").length, color: "#34d399" },
                  { label: "Planning", value: data.filter((p) => p.status === "PLANNING").length, color: "#38bdf8" },
                  { label: "Completed", value: data.filter((p) => p.status === "COMPLETED").length, color: "#64748b" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ fontSize: 13, color: "#475569", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color }}>{value}</span>
                    {label}
                  </div>
                ))}
              </div>
            )}

            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 16 }}>
              <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
                <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#475569" }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects…"
                  style={{
                    width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 9, paddingBottom: 9,
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10, color: "#e2e8f0", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                {statuses.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    style={{
                      padding: "7px 12px", borderRadius: 20, border: statusFilter === s ? "1px solid rgba(167,139,250,0.4)" : "1px solid rgba(255,255,255,0.08)",
                      background: statusFilter === s ? "rgba(167,139,250,0.12)" : "transparent",
                      color: statusFilter === s ? "#a78bfa" : "#64748b", fontSize: 12, fontWeight: statusFilter === s ? 700 : 500,
                      cursor: "pointer", textTransform: "capitalize" as const,
                    }}
                  >
                    {s === "all" ? "All" : (STATUS_CONFIG[s]?.label ?? s)}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden", marginLeft: "auto" }}>
                {([["grid", LayoutGrid], ["list", List]] as const).map(([mode, Icon]) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    style={{
                      padding: "8px 10px", border: "none", background: viewMode === mode ? "rgba(167,139,250,0.15)" : "transparent",
                      color: viewMode === mode ? "#a78bfa" : "#475569", cursor: "pointer",
                    }}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 32px" }}>
          {projects.isLoading && (
            <div style={{ display: "grid", gridTemplateColumns: viewMode === "grid" ? "repeat(auto-fill, minmax(300px, 1fr))" : "1fr", gap: 14 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ height: 140, borderRadius: 16, background: "rgba(255,255,255,0.02)" }} />
              ))}
            </div>
          )}

          {!projects.isLoading && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "80px 24px", color: "#334155" }}>
              <FolderKanban size={48} color="#1e293b" style={{ marginBottom: 14 }} />
              <h3 style={{ fontSize: 18, color: "#475569", margin: "0 0 8px" }}>
                {data.length === 0 ? "No projects yet" : "No projects match your filters"}
              </h3>
              <p style={{ fontSize: 13, margin: "0 0 20px" }}>
                {data.length === 0
                  ? canCreate ? "Create your first project brief and let AI build the plan" : "No projects available yet"
                  : "Try changing your search or status filter"
                }
              </p>
              {canCreate && data.length === 0 && (
                <button
                  onClick={() => setShowCreate(true)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                >
                  <Sparkles size={15} />Create First Project
                </button>
              )}
            </div>
          )}

          {!projects.isLoading && filtered.length > 0 && (
            viewMode === "grid" ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
                {filtered.map((p) => <ProjectCard key={p.id} project={p} />)}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filtered.map((p) => <ProjectRow key={p.id} project={p} />)}
              </div>
            )
          )}
        </div>
      </div>

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => router.push(`/projects/${id}`)}
        />
      )}
    </>
  );
}
