import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export function useCompanyJobs(enabled = true) {
  return useQuery({
    queryKey: ["company-jobs"],
    queryFn: async () => (await api.get("/jobs/company")).data,
    enabled,
  });
}
