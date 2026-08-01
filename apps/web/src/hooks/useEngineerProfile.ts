"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export function useEngineerProfile<T = Record<string, unknown>>(enabled = true) {
  return useQuery<T>({ queryKey: ["engineer-profile"], queryFn: async () => (await api.get<T>("/engineers/me")).data, enabled });
}
