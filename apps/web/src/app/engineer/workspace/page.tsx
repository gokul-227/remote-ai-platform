"use client";

import { useState } from "react";
import {
  Briefcase, CheckCircle2, Clock, FolderKanban, Send, Sparkles, XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWorkerWorkspace, TaskOfferItem, AssignedTaskItem } from "@/hooks/useWorkerWorkspace";
import { Button } from "@/components/ui/Button";
import { Badge, StatusBadge, MatchPill, type StatusTone } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { RequireRole } from "@/components/RequireRole";

const OFFER_TONE: Record<string, StatusTone> = { OFFERED: "warning", ACCEPTED: "success" };
const TASK_TONE: Record<string, StatusTone> = { COMPLETED: "success", REVIEW: "info" };
const SUBMISSION_TONE: Record<string, StatusTone> = { APPROVED: "success", CHANGES_REQUESTED: "warning" };

export default function WorkerWorkspacePage() {
  return (
    <RequireRole roles={["ENGINEER"]}>
      <WorkerWorkspaceContent />
    </RequireRole>
  );
}

function WorkerWorkspaceContent() {
  const { user } = useAuth();
  const { offersQuery, tasksQuery, respondOffer, submitWork, recordWorkLedger } = useWorkerWorkspace(!!user);

  const [activeTab, setActiveTab] = useState<"OFFERS" | "TASKS">("TASKS");
  const [selectedTask, setSelectedTask] = useState<AssignedTaskItem["task"] | null>(null);
  const [summary, setSummary] = useState("");
  const [artifactUrl, setArtifactUrl] = useState("");
  const [ledgerTask, setLedgerTask] = useState<AssignedTaskItem | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [ledgerDescription, setLedgerDescription] = useState("");

  const handleSubmitWork = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !summary.trim()) return;
    submitWork.mutate(
      { taskId: selectedTask.id, summary: summary.trim(), artifact_urls: artifactUrl.trim() ? [artifactUrl.trim()] : [] },
      { onSuccess: () => { setSelectedTask(null); setSummary(""); setArtifactUrl(""); } }
    );
  };

  const handleRecordLedger = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ledgerTask || durationMinutes <= 0 || !ledgerDescription.trim()) return;
    recordWorkLedger.mutate(
      { taskId: ledgerTask.task.id, duration_minutes: Number(durationMinutes), description: ledgerDescription.trim() },
      { onSuccess: () => { setLedgerTask(null); setDurationMinutes(60); setLedgerDescription(""); } }
    );
  };

  const offers = offersQuery.data || [];
  const tasks = tasksQuery.data || [];
  const pendingOffers = offers.filter((o) => o.offer.status === "OFFERED");
  const activeTasks = tasks.filter((t) => t.task.status !== "COMPLETED");
  const completedTasks = tasks.filter((t) => t.task.status === "COMPLETED");

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Workspace Header */}
      <div className="card-enterprise p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[var(--color-brand)] text-xs font-bold uppercase tracking-wider">
              <FolderKanban className="h-4 w-4" /> Execution Workspace
            </div>
            <h1 className="text-xl font-bold text-slate-900">Professional Execution Hub</h1>
            <p className="text-xs text-slate-500 max-w-2xl">
              Accept incoming task offers, manage assigned work units, submit deliverables for organization approval, and record transparent work ledger entries.
            </p>
          </div>

          <div className="flex gap-3 text-xs">
            <div className="bg-[var(--bg-subtle)] px-4 py-2 rounded-lg text-center">
              <span className="block text-lg font-bold text-[var(--color-brand)]">{pendingOffers.length}</span>
              <span className="text-slate-500 text-[11px]">Task Offers</span>
            </div>
            <div className="bg-[var(--bg-subtle)] px-4 py-2 rounded-lg text-center">
              <span className="block text-lg font-bold text-emerald-600">{activeTasks.length}</span>
              <span className="text-slate-500 text-[11px]">Active Tasks</span>
            </div>
            <div className="bg-[var(--bg-subtle)] px-4 py-2 rounded-lg text-center">
              <span className="block text-lg font-bold text-[var(--color-ai)]">{completedTasks.length}</span>
              <span className="text-slate-500 text-[11px]">Completed</span>
            </div>
          </div>
        </div>
      </div>

      <Tabs
        items={[
          { key: "TASKS", label: "My Assigned Tasks", count: tasks.length },
          { key: "OFFERS", label: "Task Offers", count: pendingOffers.length },
        ]}
        active={activeTab}
        onChange={(k) => setActiveTab(k as typeof activeTab)}
      />

      {/* OFFERS TAB */}
      {activeTab === "OFFERS" && (
        <div className="space-y-4">
          {offersQuery.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}</div>
          ) : offers.length > 0 ? (
            offers.map((item: TaskOfferItem) => (
              <div key={item.offer.id} className="card-enterprise p-5 space-y-4 border-l-4 border-l-[var(--color-brand)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <MatchPill score={item.offer.match_score} />
                      <span className="text-xs text-slate-500 font-medium">Project: {item.project_title}</span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-base mt-1">{item.task.title}</h3>
                  </div>
                  <StatusBadge label={item.offer.status} tone={OFFER_TONE[item.offer.status] ?? "neutral"} />
                </div>

                {item.task.description && <p className="text-xs text-slate-600 leading-relaxed">{item.task.description}</p>}

                {item.offer.matched_skills && item.offer.matched_skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[11px] text-slate-400 font-medium">Matched Skills:</span>
                    {item.offer.matched_skills.map((skill) => <Badge key={skill} tone="brand">{skill}</Badge>)}
                  </div>
                )}

                {item.offer.status === "OFFERED" && (
                  <div className="flex gap-2 border-t border-slate-100 pt-3">
                    <Button size="sm" loading={respondOffer.isPending} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => respondOffer.mutate({ offerId: item.offer.id, status: "ACCEPTED" })}>
                      Accept Task Offer
                    </Button>
                    <Button size="sm" variant="danger" disabled={respondOffer.isPending} icon={<XCircle className="h-4 w-4" />} onClick={() => respondOffer.mutate({ offerId: item.offer.id, status: "DECLINED" })}>
                      Decline
                    </Button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="card-enterprise">
              <EmptyState icon={Sparkles} title="No task offers yet" description="When organizations select you for tasks via the dispatch engine, invitations will appear here." />
            </div>
          )}
        </div>
      )}

      {/* TASKS TAB */}
      {activeTab === "TASKS" && (
        <div className="space-y-4">
          {tasksQuery.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}</div>
          ) : tasks.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {tasks.map((item: AssignedTaskItem) => (
                <div key={item.task.id} className="card-enterprise p-5 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--color-brand)] truncate">{item.project_title}</span>
                      <StatusBadge label={item.task.status} tone={TASK_TONE[item.task.status] ?? "info"} />
                    </div>

                    <h3 className="font-bold text-slate-900 text-base">{item.task.title}</h3>
                    {item.task.description && <p className="text-xs text-slate-600 line-clamp-2">{item.task.description}</p>}

                    {item.task.required_skills && item.task.required_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.task.required_skills.map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}
                      </div>
                    )}

                    {item.latest_submission && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">Submission v{item.latest_submission.version}</span>
                          <StatusBadge label={item.latest_submission.status} tone={SUBMISSION_TONE[item.latest_submission.status] ?? "info"} />
                        </div>
                        <p className="text-slate-600 line-clamp-2">{item.latest_submission.summary}</p>
                        {item.latest_submission.quality_score !== undefined && (
                          <div className="flex items-center gap-1.5 text-[var(--color-ai)] font-medium text-[11px] pt-1">
                            <Sparkles className="h-3.5 w-3.5" /> AI Quality Score: {item.latest_submission.quality_score}/100
                          </div>
                        )}
                        {item.latest_submission.review_note && (
                          <p className="text-slate-500 italic text-[11px]">Review note: &quot;{item.latest_submission.review_note}&quot;</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    {item.task.status !== "COMPLETED" && (
                      <Button size="sm" fullWidth icon={<Send className="h-3.5 w-3.5" />} onClick={() => setSelectedTask(item.task)}>Submit Work</Button>
                    )}
                    <Button size="sm" variant="secondary" fullWidth icon={<Clock className="h-3.5 w-3.5" />} onClick={() => setLedgerTask(item)}>Log Time</Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card-enterprise">
              <EmptyState icon={Briefcase} title="No assigned tasks" description="You don't have any active task assignments yet. Check the Task Offers tab to accept new work." />
            </div>
          )}
        </div>
      )}

      <Modal open={!!selectedTask} onClose={() => setSelectedTask(null)} title="Submit Work Deliverable">
        {selectedTask && (
          <>
            <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4">
              <span className="font-semibold text-slate-900 block">{selectedTask.title}</span>
              <span>Submit your completed work artifacts for client review and AI quality analysis.</span>
            </div>
            <form onSubmit={handleSubmitWork} className="space-y-4">
              <Textarea label="Summary of Completed Work" required rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Describe what was implemented, architectural decisions, and testing completed..." />
              <Input label="Artifact URL (GitHub PR / Figma / Live Demo)" type="url" value={artifactUrl} onChange={(e) => setArtifactUrl(e.target.value)} placeholder="https://github.com/org/repo/pull/42" />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setSelectedTask(null)}>Cancel</Button>
                <Button type="submit" loading={submitWork.isPending} disabled={!summary.trim()}>Submit for Review</Button>
              </div>
            </form>
          </>
        )}
      </Modal>

      <Modal open={!!ledgerTask} onClose={() => setLedgerTask(null)} title="Log Work Hours">
        <form onSubmit={handleRecordLedger} className="space-y-4">
          <Input label="Duration (Minutes)" type="number" min={15} step={15} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} required />
          <Textarea label="Activity Description" required rows={3} value={ledgerDescription} onChange={(e) => setLedgerDescription(e.target.value)} placeholder="Implemented authentication middleware and ran unit test suite..." />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setLedgerTask(null)}>Cancel</Button>
            <Button type="submit" loading={recordWorkLedger.isPending} disabled={!ledgerDescription.trim()}>Record Entry</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
