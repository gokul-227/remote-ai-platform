"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { JobPost } from "@/types";

export function useSavedJobs(enabled = true) {
  const client = useQueryClient();
  const query = useQuery<JobPost[]>({ queryKey: ["saved-jobs"], queryFn: async () => (await api.get("/saved-jobs", { params: { limit: 100 } })).data, enabled });
  const save = useMutation({ mutationFn: (jobId: string) => api.post(`/saved-jobs/${jobId}`), onSuccess: () => client.invalidateQueries({ queryKey: ["saved-jobs"] }) });
  const remove = useMutation({ mutationFn: (jobId: string) => api.delete(`/saved-jobs/${jobId}`), onSuccess: () => client.invalidateQueries({ queryKey: ["saved-jobs"] }) });
  return { ...query, save, remove };
}
