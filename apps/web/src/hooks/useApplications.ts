"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function useApplications(enabled = true) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["applications"], queryFn: async () => (await api.get("/applications/me")).data, enabled });
  const apply = useMutation({ mutationFn: ({ jobId, cover_note }: { jobId: string; cover_note?: string }) => api.post(`/applications/jobs/${jobId}`, { cover_note }), onSuccess: () => client.invalidateQueries({ queryKey: ["applications"] }) });
  const withdraw = useMutation({ mutationFn: (applicationId: string) => api.patch(`/applications/${applicationId}/withdraw`), onSuccess: () => client.invalidateQueries({ queryKey: ["applications"] }) });
  return { ...query, apply, withdraw };
}

export function useCompanyApplications(enabled = true) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["company-applications"], queryFn: async () => (await api.get("/applications/company")).data, enabled });
  const updateStatus = useMutation({
    mutationFn: ({ applicationId, status }: { applicationId: string; status: string }) => api.patch(`/applications/${applicationId}/status`, { status }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["company-applications"] }),
  });
  const invite = useMutation({
    mutationFn: ({ jobId, engineerId }: { jobId: string; engineerId: string }) => api.post(`/applications/jobs/${jobId}/invite/${engineerId}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["company-applications"] }),
  });
  return { ...query, updateStatus, invite };
}
