"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function useNotifications(enabled = true) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["notifications"], queryFn: async () => (await api.get("/notifications")).data, enabled });
  const unread = useQuery({ queryKey: ["notifications-unread"], queryFn: async () => (await api.get<{ count: number }>("/notifications/unread-count")).data, enabled });
  const markRead = useMutation({ mutationFn: (id: string) => api.patch(`/notifications/${id}/read`), onSuccess: () => { void client.invalidateQueries({ queryKey: ["notifications"] }); void client.invalidateQueries({ queryKey: ["notifications-unread"] }); } });
  const markAllRead = useMutation({ mutationFn: () => api.patch("/notifications/read-all"), onSuccess: () => { void client.invalidateQueries({ queryKey: ["notifications"] }); void client.invalidateQueries({ queryKey: ["notifications-unread"] }); } });
  return { ...query, unread, markRead, markAllRead };
}
