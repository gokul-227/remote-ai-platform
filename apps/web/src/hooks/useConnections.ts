import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function useConnections(enabled = true) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["connections"], queryFn: async () => (await api.get("/connections")).data, enabled });
  const request = useMutation({ mutationFn: (receiver_id: string) => api.post("/connections", { receiver_id }), onSuccess: () => client.invalidateQueries({ queryKey: ["connections"] }) });
  const update = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/connections/${id}`, { status }), onSuccess: () => client.invalidateQueries({ queryKey: ["connections"] }) });
  return { ...query, request, update };
}
