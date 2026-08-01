import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export function useCompanyProfile(enabled = true) {
  return useQuery({
    queryKey: ["company-profile"],
    queryFn: async () => (await api.get("/companies/me")).data,
    enabled,
  });
}
