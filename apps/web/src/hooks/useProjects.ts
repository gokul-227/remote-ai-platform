"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { ProjectRecord } from "@/hooks/useProject";

export function useProjects() {
  return useQuery<ProjectRecord[]>({
    queryKey: ["projects"],
    queryFn: async () => (await api.get<ProjectRecord[]>("/projects")).data,
  });
}

export function useCreateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { title: string; description: string; technologies: string[]; timeline?: string; budget?: number }) => (await api.post("/projects", payload)).data,
    onSuccess: () => client.invalidateQueries({ queryKey: ["projects"] }),
  });
}
