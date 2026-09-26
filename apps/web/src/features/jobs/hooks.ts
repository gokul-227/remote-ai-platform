"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { JobMatch } from "@/hooks/useRecommendations";
import type { JobPost } from "@/types";

export function useJob(id?: string | null) {
  return useQuery<JobPost>({ queryKey: ["job", id], queryFn: async () => (await api.get(`/jobs/${id}`)).data, enabled: !!id, retry: (n, e) => (e as { response?: { status?: number } }).response?.status !== 404 && n < 2 });
}

/** The signed-in engineer's AI match for one job (computed on demand server-side). */
export function useJobMatch(id: string | null | undefined, enabled: boolean) {
  return useQuery<JobMatch | null>({
    queryKey: ["job-match", id],
    enabled: enabled && !!id,
    retry: false,
    queryFn: async () => {
      try { return (await api.get(`/matching/jobs/${id}`)).data; } catch (e) {
        // 404 = no engineer profile yet; the panel shows how to fix that.
        if ((e as { response?: { status?: number } }).response?.status === 404) return null;
        throw e;
      }
    },
  });
}

export const SOURCE_LABEL: Record<string, string> = {
  remoteok: "RemoteOK", arbeitnow: "Arbeitnow", usajobs: "USAJobs", themuse: "The Muse", adzuna: "Adzuna", remotive: "Remotive", direct: "Remote AI Platform",
};
export const sourceLabel = (s?: string | null) => SOURCE_LABEL[(s || "direct").toLowerCase()] ?? s ?? "Remote AI Platform";
export const isDirect = (j: Pick<JobPost, "source" | "external_url">) => !j.external_url && (!j.source || j.source.toUpperCase() === "DIRECT");
