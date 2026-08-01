"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export function useJobs(params: Record<string, string | number | string[] | undefined> = {}) {
  return useQuery({ queryKey: ["jobs", params], queryFn: async () => { const data = (await api.get("/jobs", { params })).data; return Array.isArray(data) ? data : data.items ?? []; } });
}
