import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface TaskOfferItem {
  offer: {
    id: string;
    task_id: string;
    candidate_user_id: string;
    offered_by_id: string;
    status: "OFFERED" | "ACCEPTED" | "DECLINED" | "CANCELLED";
    match_score: number;
    matched_skills: string[];
    created_at: string;
  };
  task: {
    id: string;
    project_id: string;
    title: string;
    description?: string;
    required_skills: string[];
    status: string;
    priority: string;
    deadline?: string;
    estimated_hours?: number;
  };
  project_id: string;
  project_title: string;
}

export interface AssignedTaskItem {
  task: {
    id: string;
    project_id: string;
    title: string;
    description?: string;
    required_skills: string[];
    status: string;
    priority: string;
    deadline?: string;
    estimated_hours?: number;
  };
  project_id: string;
  project_title: string;
  latest_submission?: {
    id: string;
    version: number;
    status: "SUBMITTED" | "CHANGES_REQUESTED" | "APPROVED";
    summary: string;
    artifact_urls: string[];
    review_note?: string;
    quality_score?: number;
    ai_feedback?: string;
    created_at: string;
  };
}

export function useWorkerWorkspace(enabled = true) {
  const queryClient = useQueryClient();

  const offersQuery = useQuery<TaskOfferItem[]>({
    queryKey: ["myOffers"],
    queryFn: async () => {
      const res = await api.get("/projects/my-offers");
      return res.data;
    },
    enabled,
  });

  const tasksQuery = useQuery<AssignedTaskItem[]>({
    queryKey: ["myTasks"],
    queryFn: async () => {
      const res = await api.get("/projects/my-tasks");
      return res.data;
    },
    enabled,
  });

  const respondOfferMutation = useMutation({
    mutationFn: async ({ offerId, status }: { offerId: string; status: "ACCEPTED" | "DECLINED" }) => {
      const res = await api.patch(`/projects/task-offers/${offerId}`, { status });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myOffers"] });
      queryClient.invalidateQueries({ queryKey: ["myTasks"] });
    },
  });

  const submitWorkMutation = useMutation({
    mutationFn: async ({
      taskId,
      summary,
      artifact_urls,
    }: {
      taskId: string;
      summary: string;
      artifact_urls: string[];
    }) => {
      const res = await api.post(`/projects/tasks/${taskId}/submissions`, {
        summary,
        artifact_urls,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myTasks"] });
    },
  });

  const recordWorkLedgerMutation = useMutation({
    mutationFn: async ({
      projectId,
      taskId,
      duration_minutes,
      description,
    }: {
      projectId: string;
      taskId: string;
      duration_minutes: number;
      description: string;
    }) => {
      const res = await api.post(`/projects/${projectId}/tasks/${taskId}/work-ledger`, {
        duration_minutes,
        description,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myTasks"] });
    },
  });

  return {
    offersQuery,
    tasksQuery,
    respondOffer: respondOfferMutation,
    submitWork: submitWorkMutation,
    recordWorkLedger: recordWorkLedgerMutation,
  };
}
