"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export interface ProjectRecord { id: string; title: string; description: string; status: string; timeline?: string | null; }
export interface MilestoneRecord { id: string; title: string; description?: string | null; }
export interface TaskRecord { id: string; title: string; milestone?: string | null; status: string; }
export interface ProjectDetails { project: ProjectRecord; milestones: MilestoneRecord[]; tasks: TaskRecord[]; }

export function useProject(projectId: string) {
  return useQuery<ProjectDetails>({
    queryKey: ["project", projectId],
    queryFn: async () => (await api.get<ProjectDetails>(`/projects/${projectId}`)).data,
    enabled: Boolean(projectId),
  });
}
