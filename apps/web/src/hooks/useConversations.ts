import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function useConversations(enabled = true) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["conversations"], queryFn: async () => (await api.get("/conversations")).data, enabled });
  const create = useMutation({ mutationFn: async (participant_id: string) => (await api.post("/conversations", { participant_id })).data, onSuccess: () => client.invalidateQueries({ queryKey: ["conversations"] }) });
  return { ...query, create };
}
