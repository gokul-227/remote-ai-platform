"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Sparkles, CheckCircle, Clock, AlertTriangle, Circle, Play,
  FolderKanban, Brain, BarChart3, Shield, ChevronDown, ChevronRight, FileText, Star, Zap, XCircle,
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
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { StatusBadge, type StatusTone } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { RequireAuth } from "@/components/RequireAuth";

const TASK_STATUS: Record<string, { label: string; tone: StatusTone; icon: React.ElementType; iconClass: string }> = {
  TODO: { label: "To Do", tone: "neutral", icon: Circle, iconClass: "text-slate-400" },
  IN_PROGRESS: { label: "In Progress", tone: "info", icon: Play, iconClass: "text-sky-500" },
  REVIEW: { label: "In Review", tone: "warning", icon: AlertTriangle, iconClass: "text-amber-500" },
  DONE: { label: "Done", tone: "success", icon: CheckCircle, iconClass: "text-emerald-500" },
  COMPLETED: { label: "Done", tone: "success", icon: CheckCircle, iconClass: "text-emerald-500" },
  BLOCKED: { label: "Blocked", tone: "danger", icon: XCircle, iconClass: "text-red-500" },
};

const PROJECT_STATUS_TONE: Record<string, StatusTone> = {
  PLANNING: "info", ACTIVE: "success", PAUSED: "warning", COMPLETED: "neutral", CANCELLED: "danger",
};

function Section({
  title, icon: Icon, children, defaultOpen = true, badge,
}: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean; badge?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card-enterprise overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
        <div className="h-8 w-8 rounded-lg bg-[var(--color-ai-soft)] flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-[var(--color-ai)]" />
        </div>
        <span className="flex-1 text-sm font-semibold text-slate-900">{title}</span>
        {badge !== undefined && <span className="badge-ent badge-ent-neutral">{badge}</span>}
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function TaskCard({ task, onStatusChange, updating }: { task: TaskRecord; onStatusChange: (status: string) => void; updating: boolean }) {
  const conf = TASK_STATUS[task.status] ?? TASK_STATUS.TODO;
  const Icon = conf.icon;
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg border border-[var(--border-color)]">
      <Icon className={cn("h-4 w-4 shrink-0", conf.iconClass)} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-900 truncate">{task.title}</div>
        {task.priority && <span className="text-[11px] text-slate-400">Priority: {task.priority}</span>}
      </div>
      <select
        value={task.status}
        onChange={(e) => onStatusChange(e.target.value)}
        disabled={updating}
        className="input-enterprise py-1 text-xs w-auto"
      >
        {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
    </div>
  );
}

function SubmissionCard({ sub, onReview, onAIReview, updating }: {
  sub: SubmissionRecord;
  onReview: (status: "APPROVED" | "CHANGES_REQUESTED", note?: string) => void;
  onAIReview: () => void;
  updating: boolean;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="p-4 rounded-lg border border-[var(--border-color)] space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">v{sub.version} — {sub.summary}</div>
          <StatusBadge
            label={sub.status.replace(/_/g, " ")}
            tone={sub.status === "APPROVED" ? "success" : sub.status === "PENDING_REVIEW" ? "warning" : "neutral"}
            className="mt-1"
          />
        </div>
        <Button size="sm" variant="ghost" disabled={updating} icon={<Brain className="h-3.5 w-3.5" />} onClick={onAIReview}>AI Review</Button>
      </div>
      {sub.ai_feedback && (
        <p className="text-xs text-slate-600 bg-[var(--color-ai-soft)] rounded-lg px-3 py-2 italic">{sub.ai_feedback}</p>
      )}
      {sub.status === "PENDING_REVIEW" && (
        <div className="flex flex-wrap gap-2 pt-1">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review note (optional)…" className="input-enterprise flex-1 min-w-[160px] py-1.5 text-xs" />
          <Button size="sm" variant="secondary" disabled={updating} onClick={() => onReview("APPROVED", note)}>Approve</Button>
          <Button size="sm" variant="danger" disabled={updating} onClick={() => onReview("CHANGES_REQUESTED", note)}>Changes</Button>
        </div>
      )}
    </div>
  );
}

export default function ProjectDetailPage() {
  return (
    <RequireAuth>
      <ProjectDetailContent />
    </RequireAuth>
  );
}

function ProjectDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

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
      <div className="max-w-4xl mx-auto py-16 space-y-4 text-center text-slate-400">
        <FolderKanban className="h-10 w-10 mx-auto text-slate-300" />
        <p>Loading project…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-4xl mx-auto py-16">
        <div className="card-enterprise">
          <EmptyState icon={XCircle} title="Project not found or access denied" actionLabel="Back to Projects" onAction={() => router.push("/projects")} />
        </div>
      </div>
    );
  }

  const { project, milestones, tasks, submissions, plan } = data;
  const tasksDone = tasks.filter((t: TaskRecord) => t.status === "DONE" || t.status === "COMPLETED").length;
  const progress = tasks.length ? Math.round((tasksDone / tasks.length) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <button onClick={() => router.push("/projects")} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-3.5 w-3.5" />Back to Projects
      </button>

      <div className="card-enterprise p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge label={project.status} tone={PROJECT_STATUS_TONE[project.status] ?? "neutral"} />
              {project.budget != null && (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  💰 ${project.budget.toLocaleString()}
                </span>
              )}
              {project.timeline && (
                <span className="text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Clock className="h-3 w-3" />{project.timeline}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-900">{project.title}</h1>
            <p className="text-sm text-slate-500">{project.description}</p>
            {project.technologies && project.technologies.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {project.technologies.map((tech: string) => (
                  <span key={tech} className="text-[11px] font-medium px-2 py-0.5 rounded bg-[var(--color-brand-light)] text-[#0866FF] border border-blue-100">
                    {tech}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 flex-wrap shrink-0">
            {!plan && (
              <Button loading={planActions.generatePlan.isPending} icon={<Sparkles className="h-4 w-4" />} onClick={() => planActions.generatePlan.mutate()}>
                Generate AI Plan
              </Button>
            )}
            {plan && project.status === "PLANNING" && (
              <Button variant="secondary" loading={planActions.approvePlan.isPending} icon={<CheckCircle className="h-4 w-4" />} onClick={() => planActions.approvePlan.mutate()}>
                Approve &amp; Activate
              </Button>
            )}
            <Button variant="secondary" size="sm" loading={aiReportActions.generateProgress.isPending} icon={<BarChart3 className="h-4 w-4" />} onClick={() => aiReportActions.generateProgress.mutate()}>
              Progress Report
            </Button>
          </div>
        </div>

        {tasks.length > 0 && (
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>{tasksDone} of {tasks.length} tasks complete</span>
              <span className="font-bold text-[var(--color-brand)]">{progress}%</span>
            </div>
            <Progress value={progress} tone={progress >= 80 ? "success" : "brand"} />
          </div>
        )}
      </div>

      {plan ? (
        <Section title="AI Generated Plan" icon={Brain}>
          {plan.summary && <p className="text-sm text-slate-600 italic mb-3">{plan.summary}</p>}
          {plan.milestones && plan.milestones.length > 0 && (
            <div className="space-y-2 mb-3">
              {plan.milestones.map((m: { title: string; description?: string }, i: number) => (
                <div key={i} className="p-3 rounded-lg bg-[var(--color-ai-soft)]">
                  <div className="text-sm font-semibold text-slate-900">{m.title}</div>
                  {m.description && <p className="text-xs text-slate-500 mt-1">{m.description}</p>}
                </div>
              ))}
            </div>
          )}
          <Button size="sm" variant="ghost" loading={aiReportActions.generateRisk.isPending} icon={<Shield className="h-3.5 w-3.5" />} onClick={() => aiReportActions.generateRisk.mutate()}>
            Risk Analysis
          </Button>
        </Section>
      ) : (
        <div className="card-enterprise">
          <EmptyState
            icon={Sparkles}
            title="No AI plan generated yet"
            actionLabel="Generate AI Plan"
            onAction={() => planActions.generatePlan.mutate()}
          />
        </div>
      )}

      {(milestones.length > 0 || tasks.length > 0) && (
        <Section title="Milestones & Tasks" icon={FolderKanban} badge={tasks.length}>
          <div className="space-y-4">
            {milestones.map((m: MilestoneRecord) => {
              const mTasks = tasks.filter((t: TaskRecord) => t.milestone === m.title);
              return (
                <div key={m.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-sm font-semibold text-slate-900">{m.title}</span>
                    <span className="text-xs text-slate-400">({mTasks.length})</span>
                  </div>
                  {m.description && <p className="text-xs text-slate-500 mb-2 pl-6">{m.description}</p>}
                  <div className="space-y-1.5 pl-6">
                    {mTasks.map((t: TaskRecord) => (
                      <TaskCard key={t.id} task={t} onStatusChange={(status) => workspaceActions.updateTask.mutate({ taskId: t.id, status })} updating={workspaceActions.updateTask.isPending} />
                    ))}
                  </div>
                </div>
              );
            })}

            {(() => {
              const unassigned = tasks.filter((t: TaskRecord) => !t.milestone || !milestones.some((m: MilestoneRecord) => m.title === t.milestone));
              if (unassigned.length === 0) return null;
              return (
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">General Tasks</div>
                  <div className="space-y-1.5">
                    {unassigned.map((t: TaskRecord) => (
                      <TaskCard key={t.id} task={t} onStatusChange={(status) => workspaceActions.updateTask.mutate({ taskId: t.id, status })} updating={workspaceActions.updateTask.isPending} />
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </Section>
      )}

      {submissions.length > 0 && (
        <Section title="Work Submissions" icon={FileText} badge={submissions.length}>
          <div className="space-y-2.5">
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

      <Section title="Peer Reviews" icon={Star} defaultOpen={false}>
        {(reviews.data ?? []).length > 0 && (
          <div className="space-y-2.5 mb-4">
            {reviews.data!.map((r) => (
              <div key={r.id} className="p-3 rounded-lg border border-[var(--border-color)]">
                <div className="flex gap-0.5 mb-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={cn("h-3.5 w-3.5", i < r.rating ? "fill-amber-400 text-amber-400" : "text-slate-200")} />
                  ))}
                </div>
                <p className="text-sm text-slate-600">{r.comment}</p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <Input value={reviewForm.revieweeId} onChange={(e) => setReviewForm((f) => ({ ...f, revieweeId: e.target.value }))} placeholder="Reviewee user ID" />
          <div className="flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <button key={i} onClick={() => setReviewForm((f) => ({ ...f, rating: i + 1 }))} className="p-0.5">
                <Star className={cn("h-5 w-5", i < reviewForm.rating ? "fill-amber-400 text-amber-400" : "text-slate-200")} />
              </button>
            ))}
          </div>
          <Textarea value={reviewForm.comment} onChange={(e) => setReviewForm((f) => ({ ...f, comment: e.target.value }))} placeholder="Share your experience…" rows={3} />
          <Button
            size="sm"
            icon={<Star className="h-3.5 w-3.5" />}
            disabled={!reviewForm.revieweeId || !reviewForm.comment}
            loading={reviewActions.create.isPending}
            onClick={() => { if (reviewForm.revieweeId && reviewForm.comment) reviewActions.create.mutate(reviewForm, { onSuccess: () => setReviewForm({ revieweeId: "", rating: 5, comment: "" }) }); }}
          >
            Submit Review
          </Button>
        </div>
      </Section>

      <Section title="Project Info" icon={Zap} defaultOpen={false}>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {project.timeline && (
            <div>
              <div className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Timeline</div>
              <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-[var(--color-info)]" />{project.timeline}</div>
            </div>
          )}
          <div>
            <div className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Project ID</div>
            <div className="text-xs text-slate-500 font-mono">{project.id}</div>
          </div>
        </div>
      </Section>
    </div>
  );
}
