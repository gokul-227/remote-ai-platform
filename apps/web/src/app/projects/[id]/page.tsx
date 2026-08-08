"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Sparkles,
  CheckCircle,
  Clock,
  AlertTriangle,
  Circle,
  Play,
  FolderKanban,
  Brain,
  BarChart3,
  Shield,
  ChevronDown,
  ChevronRight,
  FileText,
  Star,
  Zap,
  X,
} from "lucide-react";
import {
  useProject,
  useProjectPlanActions,
  useProjectWorkspaceActions,
  useProjectSubmissionActions,
  useProjectReviews,
  useProjectReviewActions,
  useProjectAIReportActions,
  TaskRecord,
  MilestoneRecord,
  SubmissionRecord,
} from "@/hooks/useProject";
import { useAuth } from "@/lib/auth";

// ── Status configs ────────────────────────────────────────────────────────────
const TASK_STATUS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  TODO: { label: "To Do", color: "#64748b", icon: Circle },
  IN_PROGRESS: { label: "In Progress", color: "#38bdf8", icon: Play },
  REVIEW: { label: "In Review", color: "#facc15", icon: AlertTriangle },
  DONE: { label: "Done", color: "#34d399", icon: CheckCircle },
  COMPLETED: { label: "Done", color: "#34d399", icon: CheckCircle },
  BLOCKED: { label: "Blocked", color: "#f87171", icon: X },
};

const PROJECT_STATUS: Record<string, { label: string; color: string }> = {
  PLANNING: { label: "Planning", color: "#38bdf8" },
  ACTIVE: { label: "Active", color: "#34d399" },
  PAUSED: { label: "Paused", color: "#facc15" },
  COMPLETED: { label: "Completed", color: "#a78bfa" },
  CANCELLED: { label: "Cancelled", color: "#f87171" },
};

// ── Section collapsible ───────────────────────────────────────────────────────
function Section({
  title,
  icon: Icon,
  iconColor = "#a78bfa",
  children,
  defaultOpen = true,
  badge,
}: {
  title: string;
  icon: React.ElementType;
  iconColor?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <div style={{ width: 30, height: 30, borderRadius: 8, background: `${iconColor}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={15} color={iconColor} />
        </div>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{title}</span>
        {badge !== undefined && (
          <span style={{ fontSize: 11, fontWeight: 700, background: "rgba(255,255,255,0.06)", color: "#64748b", borderRadius: 20, padding: "2px 8px" }}>{badge}</span>
        )}
        {open ? <ChevronDown size={16} color="#475569" /> : <ChevronRight size={16} color="#475569" />}
      </button>
      {open && <div style={{ padding: "0 18px 18px" }}>{children}</div>}
    </div>
  );
}

// ── Task Card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, onStatusChange, updating }: { task: TaskRecord; onStatusChange: (status: string) => void; updating: boolean }) {
  const conf = TASK_STATUS[task.status] ?? TASK_STATUS.TODO;
  const Icon = conf.icon;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10 }}>
      <Icon size={16} color={conf.color} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.title}</div>
        {task.priority && <span style={{ fontSize: 10, color: "#64748b" }}>Priority: {task.priority}</span>}
      </div>
      <select
        value={task.status}
        onChange={(e) => onStatusChange(e.target.value)}
        disabled={updating}
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: conf.color, fontSize: 11, padding: "4px 8px", cursor: "pointer", outline: "none", fontFamily: "inherit" }}
      >
        {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
    </div>
  );
}

// ── Submission Card ───────────────────────────────────────────────────────────
function SubmissionCard({ sub, onReview, onAIReview, updating }: {
  sub: SubmissionRecord;
  onReview: (status: "APPROVED" | "CHANGES_REQUESTED", note?: string) => void;
  onAIReview: () => void;
  updating: boolean;
}) {
  const [note, setNote] = useState("");
  return (
    <div style={{ padding: "14px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>v{sub.version} — {sub.summary}</div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>Status: <span style={{ color: sub.status === "APPROVED" ? "#34d399" : sub.status === "PENDING_REVIEW" ? "#facc15" : "#94a3b8" }}>{sub.status}</span></div>
        </div>
        <button
          onClick={onAIReview}
          disabled={updating}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, border: "none", background: "rgba(167,139,250,0.12)", color: "#a78bfa", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
        >
          <Brain size={12} />AI Review
        </button>
      </div>
      {sub.ai_feedback && (
        <div style={{ fontSize: 12, color: "#94a3b8", background: "rgba(167,139,250,0.05)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontStyle: "italic" }}>
          {sub.ai_feedback}
        </div>
      )}
      {sub.status === "PENDING_REVIEW" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginTop: 8 }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Review note (optional)…"
            style={{ flex: 1, minWidth: 160, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#e2e8f0", fontSize: 12, padding: "6px 10px", outline: "none", fontFamily: "inherit" }}
          />
          <button onClick={() => onReview("APPROVED", note)} disabled={updating} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "rgba(52,211,153,0.12)", color: "#34d399", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            ✓ Approve
          </button>
          <button onClick={() => onReview("CHANGES_REQUESTED", note)} disabled={updating} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "rgba(248,113,113,0.08)", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            ✗ Changes
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const { data, isLoading, isError } = useProject(id);
  const planActions = useProjectPlanActions(id);
  const workspaceActions = useProjectWorkspaceActions(id);
  const submissionActions = useProjectSubmissionActions(id);
  const reviews = useProjectReviews(id);
  const reviewActions = useProjectReviewActions(id);
  const aiReportActions = useProjectAIReportActions(id);

  const [reviewForm, setReviewForm] = useState({ revieweeId: "", rating: 5, comment: "" });

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#080e1c", display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <FolderKanban size={40} color="#1e293b" style={{ marginBottom: 12 }} />
          <p>Loading project…</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ minHeight: "100vh", background: "#080e1c", display: "flex", alignItems: "center", justifyContent: "center", color: "#f87171", fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <X size={40} color="#ef4444" style={{ marginBottom: 12 }} />
          <p>Project not found or access denied.</p>
          <button onClick={() => router.push("/projects")} style={{ marginTop: 12, padding: "8px 18px", borderRadius: 8, border: "none", background: "rgba(248,113,113,0.1)", color: "#f87171", cursor: "pointer", fontFamily: "inherit" }}>
            ← Back to Projects
          </button>
        </div>
      </div>
    );
  }

  const { project, milestones, tasks, submissions, plan } = data;
  const statusConf = PROJECT_STATUS[project.status] ?? { label: project.status, color: "#94a3b8" };
  const tasksDone = tasks.filter((t: TaskRecord) => t.status === "DONE" || t.status === "COMPLETED").length;
  const progress = tasks.length ? Math.round((tasksDone / tasks.length) * 100) : 0;

  return (
    <>
      <style>{`
        input:focus, textarea:focus, select:focus { border-color: rgba(167,139,250,0.4) !important; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#080e1c", fontFamily: "'Inter', system-ui, sans-serif", color: "#e2e8f0" }}>
        {/* Header */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", padding: "20px 32px" }}>
          <div style={{ maxWidth: 1000, margin: "0 auto" }}>
            <button
              onClick={() => router.push("/projects")}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#64748b", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 14 }}
            >
              <ArrowLeft size={14} />Back to Projects
            </button>

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" as const }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: statusConf.color, background: `${statusConf.color}18`, padding: "3px 10px", borderRadius: 20 }}>
                    {statusConf.label}
                  </span>
                </div>
                <h1 style={{ fontSize: 26, fontWeight: 900, color: "#f1f5f9", margin: "0 0 6px", letterSpacing: "-0.02em" }}>{project.title}</h1>
                <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>{project.description}</p>
              </div>

              <div style={{ display: "flex", gap: 10, flexShrink: 0, flexWrap: "wrap" as const }}>
                {!plan && (
                  <button
                    onClick={() => planActions.generatePlan.mutate()}
                    disabled={planActions.generatePlan.isPending}
                    style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px rgba(124,58,237,0.3)", opacity: planActions.generatePlan.isPending ? 0.7 : 1 }}
                  >
                    <Sparkles size={14} />
                    {planActions.generatePlan.isPending ? "Generating…" : "Generate AI Plan"}
                  </button>
                )}
                {plan && project.status === "PLANNING" && (
                  <button
                    onClick={() => planActions.approvePlan.mutate()}
                    disabled={planActions.approvePlan.isPending}
                    style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #059669, #0d9488)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: planActions.approvePlan.isPending ? 0.7 : 1 }}
                  >
                    <CheckCircle size={14} />
                    {planActions.approvePlan.isPending ? "Activating…" : "Approve & Activate"}
                  </button>
                )}
                <button
                  onClick={() => aiReportActions.generateProgress.mutate()}
                  disabled={aiReportActions.generateProgress.isPending}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid rgba(56,189,248,0.3)", background: "rgba(56,189,248,0.08)", color: "#38bdf8", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: aiReportActions.generateProgress.isPending ? 0.7 : 1 }}
                >
                  <BarChart3 size={14} />
                  {aiReportActions.generateProgress.isPending ? "Generating…" : "Progress Report"}
                </button>
              </div>
            </div>

            {/* Progress bar */}
            {tasks.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569", marginBottom: 6 }}>
                  <span>{tasksDone} of {tasks.length} tasks complete</span>
                  <span style={{ fontWeight: 700, color: progress >= 80 ? "#34d399" : "#a78bfa" }}>{progress}%</span>
                </div>
                <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${progress}%`, background: progress >= 80 ? "#34d399" : "linear-gradient(90deg, #7c3aed, #4f46e5)", borderRadius: 6, transition: "width 0.8s ease" }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* AI Plan */}
          {plan && (
            <Section title="AI Generated Plan" icon={Brain} iconColor="#a78bfa">
              {plan.summary && (
                <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7, margin: "0 0 14px", fontStyle: "italic" }}>{plan.summary}</p>
              )}
              {plan.milestones && plan.milestones.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  {plan.milestones.map((m: { title: string; description?: string }, i: number) => (
                    <div key={i} style={{ padding: "10px 14px", background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.12)", borderRadius: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{m.title}</div>
                      {m.description && <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>{m.description}</p>}
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => aiReportActions.generateRisk.mutate()}
                disabled={aiReportActions.generateRisk.isPending}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, border: "none", background: "rgba(248,113,113,0.08)", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                <Shield size={12} />{aiReportActions.generateRisk.isPending ? "Analyzing…" : "Risk Analysis"}
              </button>
            </Section>
          )}

          {/* No plan yet */}
          {!plan && (
            <div style={{ textAlign: "center", padding: "40px 24px", background: "rgba(255,255,255,0.01)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 14 }}>
              <Sparkles size={36} color="#334155" style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 14, color: "#475569", margin: "0 0 14px" }}>No AI plan generated yet</p>
              <button
                onClick={() => planActions.generatePlan.mutate()}
                disabled={planActions.generatePlan.isPending}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                <Sparkles size={15} />
                {planActions.generatePlan.isPending ? "Generating Plan…" : "Generate AI Plan"}
              </button>
            </div>
          )}

          {/* Milestones & Tasks */}
          {(milestones.length > 0 || tasks.length > 0) && (
            <Section title="Milestones & Tasks" icon={FolderKanban} iconColor="#34d399" badge={tasks.length}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {milestones.map((m: MilestoneRecord) => {
                  const mTasks = tasks.filter((t: TaskRecord) => t.milestone === m.title);
                  return (
                    <div key={m.id}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <CheckCircle size={14} color="#34d399" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{m.title}</span>
                        <span style={{ fontSize: 11, color: "#475569" }}>({mTasks.length})</span>
                      </div>
                      {m.description && <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px", paddingLeft: 22 }}>{m.description}</p>}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 22 }}>
                        {mTasks.map((t: TaskRecord) => (
                          <TaskCard
                            key={t.id} task={t}
                            onStatusChange={(status) => workspaceActions.updateTask.mutate({ taskId: t.id, status })}
                            updating={workspaceActions.updateTask.isPending}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Tasks with no milestone */}
                {(() => {
                  const unassigned = tasks.filter((t: TaskRecord) => !t.milestone || !milestones.some((m: MilestoneRecord) => m.title === t.milestone));
                  if (unassigned.length === 0) return null;
                  return (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>General Tasks</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {unassigned.map((t: TaskRecord) => (
                          <TaskCard
                            key={t.id} task={t}
                            onStatusChange={(status) => workspaceActions.updateTask.mutate({ taskId: t.id, status })}
                            updating={workspaceActions.updateTask.isPending}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </Section>
          )}

          {/* Submissions */}
          {submissions.length > 0 && (
            <Section title="Work Submissions" icon={FileText} iconColor="#facc15" badge={submissions.length}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {submissions.map((sub: SubmissionRecord) => (
                  <SubmissionCard
                    key={sub.id}
                    sub={sub}
                    onReview={(status, note) => submissionActions.review.mutate({ submissionId: sub.id, status, reviewNote: note })}
                    onAIReview={() => submissionActions.aiReview.mutate(sub.id)}
                    updating={submissionActions.review.isPending || submissionActions.aiReview.isPending}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* Peer Reviews */}
          <Section title="Peer Reviews" icon={Star} iconColor="#facc15" defaultOpen={false}>
            {(reviews.data ?? []).length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                {reviews.data!.map((r) => (
                  <div key={r.id} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10 }}>
                    <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={13} fill={i < r.rating ? "#facc15" : "none"} color={i < r.rating ? "#facc15" : "#334155"} />
                      ))}
                    </div>
                    <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>{r.comment}</p>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input value={reviewForm.revieweeId} onChange={(e) => setReviewForm((f) => ({ ...f, revieweeId: e.target.value }))} placeholder="Reviewee user ID" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e2e8f0", fontSize: 13, padding: "8px 12px", outline: "none", fontFamily: "inherit" }} />
              <div style={{ display: "flex", gap: 4 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <button key={i} onClick={() => setReviewForm((f) => ({ ...f, rating: i + 1 }))} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                    <Star size={20} fill={i < reviewForm.rating ? "#facc15" : "none"} color={i < reviewForm.rating ? "#facc15" : "#334155"} />
                  </button>
                ))}
              </div>
              <textarea value={reviewForm.comment} onChange={(e) => setReviewForm((f) => ({ ...f, comment: e.target.value }))} placeholder="Share your experience…" rows={3} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e2e8f0", fontSize: 13, padding: "8px 12px", outline: "none", fontFamily: "inherit", resize: "none" as const }} />
              <button
                onClick={() => { if (reviewForm.revieweeId && reviewForm.comment) reviewActions.create.mutate(reviewForm, { onSuccess: () => setReviewForm({ revieweeId: "", rating: 5, comment: "" }) }); }}
                disabled={!reviewForm.revieweeId || !reviewForm.comment || reviewActions.create.isPending}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 9, border: "none", background: (reviewForm.revieweeId && reviewForm.comment) ? "linear-gradient(135deg, #7c3aed, #4f46e5)" : "rgba(255,255,255,0.05)", color: (reviewForm.revieweeId && reviewForm.comment) ? "#fff" : "#475569", fontSize: 13, fontWeight: 700, cursor: "pointer", alignSelf: "flex-start" as const }}
              >
                <Star size={13} />{reviewActions.create.isPending ? "Submitting…" : "Submit Review"}
              </button>
            </div>
          </Section>

          {/* Project meta */}
          <Section title="Project Info" icon={Zap} iconColor="#38bdf8" defaultOpen={false}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              {project.timeline && (
                <div>
                  <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 }}>Timeline</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", display: "flex", alignItems: "center", gap: 6 }}><Clock size={14} color="#38bdf8" />{project.timeline}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 }}>Project ID</div>
                <div style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>{project.id}</div>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
