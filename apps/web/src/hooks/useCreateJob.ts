import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";

export function useCreateJob() {
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post("/jobs", payload)).data,
  });
}
