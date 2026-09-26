"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { CompanyProfile, EngineerProfile, JobPost } from "@/types";

export interface GlobalSearchResponse {
  query: string;
  total_jobs: number;
  total_engineers: number;
  total_companies: number;
  jobs: JobPost[];
  engineers: EngineerProfile[];
  companies: CompanyProfile[];
}

export function useSearch(query: string, enabled = true) {
  return useQuery<GlobalSearchResponse>({
    queryKey: ["search", query],
    queryFn: async () => (await api.get("/search", { params: { q: query } })).data,
    enabled: enabled && query.trim().length > 1,
    staleTime: 30_000,
  });
}
