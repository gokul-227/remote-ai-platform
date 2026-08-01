"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { ProjectRecord } from "@/hooks/useProject";

export function useProjects() {
  return useQuery<ProjectRecord[]>({
    queryKey: ["projects"],
    queryFn: async () => (await api.get<ProjectRecord[]>("/projects")).data,
  });
}
