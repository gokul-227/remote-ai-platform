import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Connection, ConnectionStatus } from "@/types";

export function useConnections(enabled = true) {
  const client = useQueryClient();
  const query = useQuery<Connection[]>({ queryKey: ["connections"], queryFn: async () => (await api.get("/connections")).data, enabled });
  const request = useMutation({ mutationFn: (receiver_id: string) => api.post("/connections", { receiver_id }), onSuccess: () => client.invalidateQueries({ queryKey: ["connections"] }) });
  const update = useMutation({ mutationFn: ({ id, status }: { id: string; status: ConnectionStatus }) => api.patch(`/connections/${id}`, { status }), onSuccess: () => client.invalidateQueries({ queryKey: ["connections"] }) });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/connections/${id}`), onSuccess: () => client.invalidateQueries({ queryKey: ["connections"] }) });
  return { ...query, request, update, remove };
}

/** The other person in a connection, from the current user's point of view. */
export function otherParty(c: Connection, myId?: string) {
  return c.sender_id === myId ? c.receiver : c.sender;
}
