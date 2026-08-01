import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function useConversations(enabled = true) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["conversations"], queryFn: async () => (await api.get("/conversations")).data, enabled });
  const create = useMutation({ mutationFn: (participant_id: string) => api.post("/conversations", { participant_id }), onSuccess: () => client.invalidateQueries({ queryKey: ["conversations"] }) });
  return { ...query, create };
}
