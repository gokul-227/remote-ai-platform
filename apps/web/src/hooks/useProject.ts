"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface ProjectRecord { id: string; title: string; description: string; status: string; timeline?: string | null; }
export interface MilestoneRecord { id: string; title: string; description?: string | null; }
export interface TaskRecord { id: string; title: string; milestone?: string | null; status: string; assigned_user_id?: string | null; priority?: string; }
export interface TaskDependencyRecord { id: string; task_id: string; depends_on_task_id: string; }
export interface ProjectDetails { project: ProjectRecord; milestones: MilestoneRecord[]; tasks: TaskRecord[]; dependencies: TaskDependencyRecord[]; submissions: SubmissionRecord[]; plan?: { summary?: string; milestones?: Array<{ title: string; description?: string }>; tasks?: Array<{ title: string; milestone?: string; required_skills?: string[] }> } | null; }
export interface ProjectAIReport { id: string; report_type: string; content?: string | null; payload: Record<string, unknown>; created_at: string; }
export interface TaskOfferRecord { offer: { id: string; status: string; match_score: number; matched_skills: string[] }; task: { id: string; title: string; status: string }; project: { id: string; title: string }; }
export interface SubmissionRecord { id: string; task_id: string; version: number; status: string; summary: string; artifact_urls: string[]; review_note?: string | null; quality_score?: number | null; ai_feedback?: string | null; created_at: string; }
export interface LedgerEntryRecord { id: string; task_id: string; worker_id: string; duration_minutes: number; description: string; status: string; created_at: string; }
export interface ProjectLedger { entries: LedgerEntryRecord[]; total_minutes: number; by_worker_minutes: Record<string, number>; }
export interface PaymentRecord { id: string; task_id?: string | null; payer_id: string; payee_id: string; amount: number; currency: string; status: string; provider: string; created_at: string; }
export interface ProjectReviewRecord { id: string; reviewer_id: string; reviewee_id: string; rating: number; comment: string; created_at: string; }

export function useProject(projectId: string) {
  return useQuery<ProjectDetails>({
    queryKey: ["project", projectId],
    queryFn: async () => (await api.get<ProjectDetails>(`/projects/${projectId}`)).data,
    enabled: Boolean(projectId),
  });
}

export function useProjectPlanActions(projectId: string) {
  const client = useQueryClient();
  const generatePlan = useMutation({
    mutationFn: async () => (await api.post(`/projects/${projectId}/plan`)).data,
    onSuccess: () => client.invalidateQueries({ queryKey: ["project", projectId] }),
  });
  const approvePlan = useMutation({
    mutationFn: async () => (await api.post(`/projects/${projectId}/approve-plan`)).data,
    onSuccess: () => client.invalidateQueries({ queryKey: ["project", projectId] }),
  });
  return { generatePlan, approvePlan };
}

export function useProjectAIReports(projectId: string) {
  return useQuery<ProjectAIReport[]>({
    queryKey: ["project-ai-reports", projectId],
    queryFn: async () => (await api.get<ProjectAIReport[]>(`/projects/${projectId}/ai-report`)).data,
    enabled: Boolean(projectId),
  });
}

export function useProjectAIReportActions(projectId: string) {
  const client = useQueryClient();
  const generateProgress = useMutation({
    mutationFn: async () => (await api.post(`/projects/${projectId}/ai/progress-summary`)).data as ProjectAIReport,
    onSuccess: () => client.invalidateQueries({ queryKey: ["project-ai-reports", projectId] }),
  });
  const generateRisk = useMutation({
    mutationFn: async () => (await api.post(`/projects/${projectId}/ai/risk-analysis`)).data as ProjectAIReport,
    onSuccess: () => client.invalidateQueries({ queryKey: ["project-ai-reports", projectId] }),
  });
  return { generateProgress, generateRisk };
}

export function useProjectWorkspaceActions(projectId: string) {
  const client = useQueryClient();
  const updateTask = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => (await api.patch(`/projects/tasks/${taskId}`, { status })).data,
    onSuccess: () => client.invalidateQueries({ queryKey: ["project", projectId] }),
  });
  const addDependency = useMutation({
    mutationFn: async ({ taskId, dependsOnTaskId }: { taskId: string; dependsOnTaskId: string }) => (await api.post(`/projects/tasks/${taskId}/dependencies`, { depends_on_task_id: dependsOnTaskId })).data,
    onSuccess: () => client.invalidateQueries({ queryKey: ["project", projectId] }),
  });
  const offerTask = useMutation({
    mutationFn: async ({ taskId, candidateId }: { taskId: string; candidateId: string }) => (await api.post(`/projects/tasks/${taskId}/offers`, { candidate_id: candidateId })).data,
    onSuccess: () => client.invalidateQueries({ queryKey: ["project", projectId] }),
  });
  return { updateTask, addDependency, offerTask };
}

export function useTaskOffers(enabled = true) {
  const client = useQueryClient();
  const query = useQuery<TaskOfferRecord[]>({ queryKey: ["task-offers"], queryFn: async () => (await api.get<TaskOfferRecord[]>("/projects/task-offers")).data, enabled });
  const respond = useMutation({
    mutationFn: async ({ offerId, status }: { offerId: string; status: "ACCEPTED" | "DECLINED" }) => (await api.patch(`/projects/task-offers/${offerId}`, { status })).data,
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["task-offers"] }); },
  });
  return { ...query, respond };
}

export function useProjectSubmissionActions(projectId: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["project", projectId] });
  const submit = useMutation({
    mutationFn: async ({ taskId, summary, artifactUrls }: { taskId: string; summary: string; artifactUrls: string[] }) => (await api.post(`/projects/tasks/${taskId}/submissions`, { summary, artifact_urls: artifactUrls })).data,
    onSuccess: refresh,
  });
  const review = useMutation({
    mutationFn: async ({ submissionId, status, reviewNote }: { submissionId: string; status: "APPROVED" | "CHANGES_REQUESTED"; reviewNote?: string }) => (await api.patch(`/projects/submissions/${submissionId}/review`, { status, review_note: reviewNote })).data,
    onSuccess: refresh,
  });
  const aiReview = useMutation({
    mutationFn: async (submissionId: string) => (await api.post(`/projects/submissions/${submissionId}/ai-review`)).data,
    onSuccess: refresh,
  });
  return { submit, review, aiReview };
}

export function useProjectLedger(projectId: string) {
  return useQuery<ProjectLedger>({
    queryKey: ["project-ledger", projectId],
    queryFn: async () => (await api.get<ProjectLedger>(`/projects/${projectId}/ledger`)).data,
    enabled: Boolean(projectId),
  });
}

export function useProjectLedgerActions(projectId: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["project-ledger", projectId] });
  const record = useMutation({
    mutationFn: async ({ taskId, durationMinutes, description, submissionId }: { taskId: string; durationMinutes: number; description: string; submissionId?: string }) => (await api.post(`/projects/tasks/${taskId}/ledger`, { duration_minutes: durationMinutes, description, submission_id: submissionId })).data,
    onSuccess: refresh,
  });
  const voidEntry = useMutation({
    mutationFn: async ({ entryId, reason }: { entryId: string; reason: string }) => (await api.patch(`/projects/ledger/${entryId}/void`, { reason })).data,
    onSuccess: refresh,
  });
  return { record, voidEntry };
}

export function useProjectPayments(projectId: string) {
  return useQuery<PaymentRecord[]>({
    queryKey: ["project-payments", projectId],
    queryFn: async () => (await api.get<PaymentRecord[]>(`/projects/${projectId}/payments`)).data,
    enabled: Boolean(projectId),
  });
}

export function useProjectPaymentActions(projectId: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["project-payments", projectId] });
  const escrow = useMutation({
    mutationFn: async ({ amount, currency, taskId, payeeId }: { amount: number; currency: string; taskId?: string; payeeId: string }) => (await api.post(`/projects/${projectId}/payments/escrow`, { amount, currency, task_id: taskId || undefined, payee_id: payeeId })).data,
    onSuccess: refresh,
  });
  const release = useMutation({
    mutationFn: async (paymentId: string) => (await api.patch(`/projects/payments/${paymentId}/release`)).data,
    onSuccess: refresh,
  });
  const refund = useMutation({
    mutationFn: async (paymentId: string) => (await api.patch(`/projects/payments/${paymentId}/refund`)).data,
    onSuccess: refresh,
  });
  return { escrow, release, refund };
}

export function useProjectReviews(projectId: string) {
  return useQuery<ProjectReviewRecord[]>({
    queryKey: ["project-reviews", projectId],
    queryFn: async () => (await api.get<ProjectReviewRecord[]>(`/projects/${projectId}/reviews`)).data,
    enabled: Boolean(projectId),
  });
}

export function useProjectReviewActions(projectId: string) {
  const client = useQueryClient();
  const create = useMutation({
    mutationFn: async ({ revieweeId, rating, comment }: { revieweeId: string; rating: number; comment: string }) => (await api.post(`/projects/${projectId}/reviews`, { reviewee_id: revieweeId, rating, comment })).data,
    onSuccess: () => client.invalidateQueries({ queryKey: ["project-reviews", projectId] }),
  });
  return { create };
}
