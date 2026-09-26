import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Conversation } from "@/types";

export function useConversations(enabled = true) {
  const client = useQueryClient();
  const query = useQuery<Conversation[]>({ queryKey: ["conversations"], queryFn: async () => (await api.get("/conversations")).data, enabled });
  const create = useMutation({ mutationFn: async (participant_id: string) => (await api.post<Conversation>("/conversations", { participant_id })).data, onSuccess: () => client.invalidateQueries({ queryKey: ["conversations"] }) });
  return { ...query, create };
}

/** Unread direct messages across all conversations — drives the shell's messages badge. */
export function useUnreadMessages(enabled = true) {
  return useQuery<{ count: number }>({
    queryKey: ["messages-unread"],
    queryFn: async () => (await api.get("/conversations/unread-count")).data,
    enabled,
    refetchInterval: 60_000,
  });
}
