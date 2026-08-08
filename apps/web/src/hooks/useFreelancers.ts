import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export function useFreelancers(params: { query?: string; skills?: string[]; minYears?: string; role?: string; openOnly?: boolean } = {}) {
  return useQuery({
    queryKey: ["freelancers", params],
    queryFn: async () => (await api.get("/engineers/search", { params: { query: params.query || undefined, skills: params.skills?.length ? params.skills : undefined, min_years_exp: params.minYears || undefined, primary_role: params.role || undefined, is_open_to_work: params.openOnly } })).data,
  });
}
