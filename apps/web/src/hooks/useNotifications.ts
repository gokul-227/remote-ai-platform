"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function useNotifications(enabled = true) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["notifications"], queryFn: async () => (await api.get("/notifications")).data, enabled });
  const markRead = useMutation({ mutationFn: (id: string) => api.patch(`/notifications/${id}/read`), onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }) });
  return { ...query, markRead };
}
