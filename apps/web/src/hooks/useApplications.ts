"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function useApplications(enabled = true) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["applications"], queryFn: async () => (await api.get("/applications/me")).data, enabled });
  const apply = useMutation({ mutationFn: ({ jobId, cover_note }: { jobId: string; cover_note?: string }) => api.post(`/applications/jobs/${jobId}`, { cover_note }), onSuccess: () => client.invalidateQueries({ queryKey: ["applications"] }) });
  return { ...query, apply };
}
