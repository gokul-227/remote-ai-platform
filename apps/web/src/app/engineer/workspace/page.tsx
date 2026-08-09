"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  CheckCircle2,
  Clock,
  FileCode,
  FileCheck,
  FolderKanban,
  Send,
  Sparkles,
  XCircle,
  Plus,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWorkerWorkspace, TaskOfferItem, AssignedTaskItem } from "@/hooks/useWorkerWorkspace";

export default function WorkerWorkspacePage() {
  const { user } = useAuth();
  const { offersQuery, tasksQuery, respondOffer, submitWork, recordWorkLedger } = useWorkerWorkspace(!!user);

  const [activeTab, setActiveTab] = useState<"OFFERS" | "TASKS">("TASKS");
  const [selectedTask, setSelectedTask] = useState<AssignedTaskItem["task"] | null>(null);

  // Submit work form state
  const [summary, setSummary] = useState("");
  const [artifactUrl, setArtifactUrl] = useState("");

  // Work ledger form state
  const [ledgerTask, setLedgerTask] = useState<AssignedTaskItem | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [ledgerDescription, setLedgerDescription] = useState("");

  const handleSubmitWork = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !summary.trim()) return;
    submitWork.mutate(
      {
        taskId: selectedTask.id,
        summary: summary.trim(),
        artifact_urls: artifactUrl.trim() ? [artifactUrl.trim()] : [],
      },
      {
        onSuccess: () => {
          setSelectedTask(null);
          setSummary("");
          setArtifactUrl("");
        },
      }
    );
  };

  const handleRecordLedger = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ledgerTask || durationMinutes <= 0 || !ledgerDescription.trim()) return;
    recordWorkLedger.mutate(
      {
        projectId: ledgerTask.project_id,
        taskId: ledgerTask.task.id,
        duration_minutes: Number(durationMinutes),
        description: ledgerDescription.trim(),
      },
      {
        onSuccess: () => {
          setLedgerTask(null);
          setDurationMinutes(60);
          setLedgerDescription("");
        },
      }
    );
  };

  const offers = offersQuery.data || [];
  const tasks = tasksQuery.data || [];

  const pendingOffers = offers.filter((o) => o.offer.status === "OFFERED");
  const activeTasks = tasks.filter((t) => t.task.status !== "COMPLETED");
  const completedTasks = tasks.filter((t) => t.task.status === "COMPLETED");

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-6">
      {/* Workspace Header */}
      <div className="card-enterprise p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-[#0A66C2] text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sky-400 text-xs font-bold uppercase tracking-wider">
              <FolderKanban className="h-4 w-4" /> Work Dispatch & Execution Workspace
            </div>
            <h1 className="text-2xl font-bold">Engineer Execution Hub</h1>
            <p className="text-xs text-slate-300 max-w-2xl">
              Accept incoming Uber-style task offers, manage assigned work units, submit deliverables for client approval, and record transparent work ledger entries.
            </p>
          </div>

          <div className="flex gap-3 text-xs">
            <div className="bg-white/10 backdrop-blur px-4 py-2 rounded-lg text-center">
              <span className="block text-lg font-bold text-sky-300">{pendingOffers.length}</span>
              <span className="text-slate-300 text-[11px]">Task Offers</span>
            </div>
            <div className="bg-white/10 backdrop-blur px-4 py-2 rounded-lg text-center">
              <span className="block text-lg font-bold text-emerald-300">{activeTasks.length}</span>
              <span className="text-slate-300 text-[11px]">Active Tasks</span>
            </div>
            <div className="bg-white/10 backdrop-blur px-4 py-2 rounded-lg text-center">
              <span className="block text-lg font-bold text-indigo-300">{completedTasks.length}</span>
              <span className="text-slate-300 text-[11px]">Completed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab("TASKS")}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "TASKS"
              ? "border-[#0A66C2] text-[#0A66C2]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Briefcase className="h-4 w-4" /> My Assigned Tasks ({tasks.length})
        </button>
        <button
          onClick={() => setActiveTab("OFFERS")}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "OFFERS"
              ? "border-[#0A66C2] text-[#0A66C2]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Sparkles className="h-4 w-4" /> Task Offers ({pendingOffers.length} Pending)
        </button>
      </div>

      {/* OFFERS TAB */}
      {activeTab === "OFFERS" && (
        <div className="space-y-4">
          {offersQuery.isLoading ? (
            <p className="text-xs text-slate-400">Loading task offers...</p>
          ) : offers.length > 0 ? (
            offers.map((item: TaskOfferItem) => (
              <div key={item.offer.id} className="card-enterprise p-5 space-y-4 border-l-4 border-l-[#0A66C2]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="pill-match-high text-xs font-bold px-2.5 py-0.5 rounded-full">
                        {Math.round(item.offer.match_score)}% AI Match
                      </span>
                      <span className="text-xs text-slate-500 font-medium">Project: {item.project_title}</span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-base mt-1">{item.task.title}</h3>
                  </div>

                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase ${
                      item.offer.status === "OFFERED"
                        ? "bg-amber-100 text-amber-800"
                        : item.offer.status === "ACCEPTED"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {item.offer.status}
                  </span>
                </div>

                {item.task.description && (
                  <p className="text-xs text-slate-600 leading-relaxed">{item.task.description}</p>
                )}

                {item.offer.matched_skills && item.offer.matched_skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[11px] text-slate-400 font-medium">Matched Skills:</span>
                    {item.offer.matched_skills.map((skill) => (
                      <span key={skill} className="bg-sky-50 text-[#0A66C2] text-[11px] font-medium px-2 py-0.5 rounded">
                        {skill}
                      </span>
                    ))}
                  </div>
                )}

                {item.offer.status === "OFFERED" && (
                  <div className="flex gap-3 border-t border-slate-100 pt-3">
                    <button
                      onClick={() => respondOffer.mutate({ offerId: item.offer.id, status: "ACCEPTED" })}
                      disabled={respondOffer.isPending}
                      className="btn-primary-brand text-xs py-1.5 px-4 flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Accept Task Offer
                    </button>
                    <button
                      onClick={() => respondOffer.mutate({ offerId: item.offer.id, status: "DECLINED" })}
                      disabled={respondOffer.isPending}
                      className="btn-secondary-brand text-xs py-1.5 px-4 flex items-center gap-1.5 text-red-600 hover:bg-red-50 border-red-200"
                    >
                      <XCircle className="h-4 w-4" /> Decline
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="card-enterprise p-12 text-center space-y-2">
              <Sparkles className="h-8 w-8 text-slate-300 mx-auto" />
              <h3 className="font-semibold text-slate-900 text-sm">No task offers yet</h3>
              <p className="text-xs text-slate-500">
                When clients select you for tasks via the Uber-style dispatch engine, invitations will appear here.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TASKS TAB */}
      {activeTab === "TASKS" && (
        <div className="space-y-4">
          {tasksQuery.isLoading ? (
            <p className="text-xs text-slate-400">Loading assigned tasks...</p>
          ) : tasks.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {tasks.map((item: AssignedTaskItem) => (
                <div key={item.task.id} className="card-enterprise p-5 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#0A66C2] truncate">{item.project_title}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          item.task.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800"
                            : item.task.status === "REVIEW"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {item.task.status}
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-900 text-base">{item.task.title}</h3>
                    {item.task.description && (
                      <p className="text-xs text-slate-600 line-clamp-2">{item.task.description}</p>
                    )}

                    {item.task.required_skills && item.task.required_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.task.required_skills.map((s) => (
                          <span key={s} className="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Latest Submission Review Status */}
                    {item.latest_submission && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">
                            Submission v{item.latest_submission.version}
                          </span>
                          <span
                            className={`font-bold text-[10px] px-2 py-0.5 rounded ${
                              item.latest_submission.status === "APPROVED"
                                ? "bg-emerald-100 text-emerald-700"
                                : item.latest_submission.status === "CHANGES_REQUESTED"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {item.latest_submission.status}
                          </span>
                        </div>
                        <p className="text-slate-600 line-clamp-2">{item.latest_submission.summary}</p>

                        {item.latest_submission.quality_score !== undefined && (
                          <div className="flex items-center gap-1.5 text-purple-700 font-medium text-[11px] pt-1">
                            <Sparkles className="h-3.5 w-3.5" />
                            AI Quality Score: {item.latest_submission.quality_score}/100
                          </div>
                        )}

                        {item.latest_submission.review_note && (
                          <p className="text-slate-500 italic text-[11px]">
                            Review note: &quot;{item.latest_submission.review_note}&quot;
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    {item.task.status !== "COMPLETED" && (
                      <button
                        onClick={() => setSelectedTask(item.task)}
                        className="btn-primary-brand text-xs py-1.5 px-3 flex items-center gap-1 flex-1 justify-center"
                      >
                        <Send className="h-3.5 w-3.5" /> Submit Work
                      </button>
                    )}

                    <button
                      onClick={() => setLedgerTask(item)}
                      className="btn-secondary-brand text-xs py-1.5 px-3 flex items-center gap-1 text-slate-700 flex-1 justify-center"
                    >
                      <Clock className="h-3.5 w-3.5 text-slate-500" /> Log Time
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card-enterprise p-12 text-center space-y-2">
              <Briefcase className="h-8 w-8 text-slate-300 mx-auto" />
              <h3 className="font-semibold text-slate-900 text-sm">No assigned tasks</h3>
              <p className="text-xs text-slate-500">
                You don&apos;t have any active task assignments yet. Check the Task Offers tab to accept new work.
              </p>
            </div>
          )}
        </div>
      )}

      {/* SUBMIT WORK MODAL */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card-enterprise max-w-lg w-full p-6 space-y-4 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-[#0A66C2]" /> Submit Work Deliverable
              </h3>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-900 block">{selectedTask.title}</span>
              <span>Submit your completed work artifacts for client review and AI quality analysis.</span>
            </div>

            <form onSubmit={handleSubmitWork} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Summary of Completed Work
                </label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Describe what was implemented, architectural decisions, and testing completed..."
                  rows={4}
                  required
                  className="input-enterprise w-full text-xs p-3"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Artifact URL (GitHub PR / Figma / Live Demo)
                </label>
                <input
                  type="url"
                  value={artifactUrl}
                  onChange={(e) => setArtifactUrl(e.target.value)}
                  placeholder="https://github.com/org/repo/pull/42"
                  className="input-enterprise text-xs py-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedTask(null)}
                  className="btn-secondary-brand text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitWork.isPending || !summary.trim()}
                  className="btn-primary-brand text-xs py-2 px-5 disabled:opacity-50"
                >
                  {submitWork.isPending ? "Submitting..." : "Submit for Review"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LOG TIME MODAL */}
      {ledgerTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card-enterprise max-w-md w-full p-6 space-y-4 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Clock className="h-5 w-5 text-emerald-600" /> Log Work Hours
              </h3>
              <button
                onClick={() => setLedgerTask(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordLedger} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Duration (Minutes)
                </label>
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="input-enterprise text-xs py-2"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Activity Description
                </label>
                <textarea
                  value={ledgerDescription}
                  onChange={(e) => setLedgerDescription(e.target.value)}
                  placeholder="Implemented authentication middleware and ran unit test suite..."
                  rows={3}
                  required
                  className="input-enterprise w-full text-xs p-3"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setLedgerTask(null)}
                  className="btn-secondary-brand text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recordWorkLedger.isPending || !ledgerDescription.trim()}
                  className="btn-primary-brand text-xs py-2 px-5 disabled:opacity-50"
                >
                  {recordWorkLedger.isPending ? "Recording..." : "Record Entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
