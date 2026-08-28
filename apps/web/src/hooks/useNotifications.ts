"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface Notification {
  id: string;
  title: string;
  body: string;
  kind: string;
  is_read: boolean;
  created_at: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const WS_URL = API_URL.replace(/^http/, "ws");

/**
 * Unified notifications hook — REST queries + real-time WebSocket push.
 * When a WebSocket message of type "notification" arrives, the query cache
 * is invalidated immediately so the UI refreshes without polling.
 */
export function useNotifications(userIdOrEnabled?: string | boolean | null, enabled = true) {
  const userId = typeof userIdOrEnabled === "string" ? userIdOrEnabled : null;
  const isEnabled = typeof userIdOrEnabled === "boolean" ? userIdOrEnabled : enabled;

  const client = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // ── REST queries ──────────────────────────────────────────────────────────
  const query = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get("/notifications")).data,
    enabled: isEnabled,
  });

  const unread = useQuery<{ count: number }>({
    queryKey: ["notifications-unread"],
    queryFn: async () => (await api.get<{ count: number }>("/notifications/unread-count")).data,
    enabled: isEnabled,
    refetchInterval: wsConnected ? false : 30_000, // Poll as fallback when WS is down
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["notifications"] });
      void client.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.patch("/notifications/read-all"),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["notifications"] });
      void client.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
  });

  const connectWsRef = useRef<() => void>(() => {});

  // ── WebSocket real-time push ───────────────────────────────────────────────
  const connectWs = useCallback(() => {
    if (!userId || !isEnabled) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_URL}/api/v1/notifications/ws/${userId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string };
        if (msg.type === "notification") {
          // Invalidate both lists — immediate re-fetch with zero polling overhead
          void client.invalidateQueries({ queryKey: ["notifications"] });
          void client.invalidateQueries({ queryKey: ["notifications-unread"] });
        }
      } catch {
        // Malformed message — ignore
      }
    };

    ws.onerror = () => {
      setWsConnected(false);
    };

    ws.onclose = () => {
      setWsConnected(false);
      wsRef.current = null;
      // Reconnect after 5s unless component is unmounted
      if (isEnabled && userId) {
        setTimeout(() => {
          connectWsRef.current();
        }, 5_000);
      }
    };
  }, [userId, isEnabled, client]);

  useEffect(() => {
    connectWsRef.current = connectWs;
  }, [connectWs]);

  useEffect(() => {
    if (!userId || !isEnabled) return;
    connectWs();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [userId, isEnabled, connectWs]);

  return {
    ...query,
    unread,
    markRead,
    markAllRead,
    wsConnected,
  };
}
