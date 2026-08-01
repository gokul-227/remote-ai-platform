import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export function useFreelancers(query = "") {
  return useQuery({
    queryKey: ["freelancers", query],
    queryFn: async () => (await api.get("/engineers/search", { params: { query: query || undefined } })).data,
  });
}
