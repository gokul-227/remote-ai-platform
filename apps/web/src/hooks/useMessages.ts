import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";

export function useMessages(conversationId: string | null, enabled = true) {
  const [messages, setMessages] = useState<Array<{ id: string; sender_id: string; content: string; created_at: string }>>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    if (!conversationId || !enabled) return;
    let socket: WebSocket | null = null;
    api.get(`/conversations/${conversationId}/messages`).then((response) => setMessages(response.data)).catch(() => setMessages([]));
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const wsUrl = `${apiUrl.replace(/^http/, "ws")}/api/v1`;
    const token = localStorage.getItem("remote_ai_platform_token");
    if (token) {
      socket = new WebSocket(`${wsUrl}/messages/ws/${conversationId}?token=${encodeURIComponent(token)}`);
      socketRef.current = socket;
      socket.onopen = () => setConnected(true);
      socket.onclose = () => setConnected(false);
      socket.onmessage = (event) => setMessages((current) => [...current, JSON.parse(event.data)]);
    }
    return () => { socket?.close(); socketRef.current = null; };
  }, [conversationId, enabled]);
  const send = (content: string) => {
    if (!conversationId || !content.trim()) return;
    const token = localStorage.getItem("remote_ai_platform_token");
    if (connected && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ content }));
      return;
    }
    return api.post(`/conversations/${conversationId}/messages`, { content }, { headers: token ? { Authorization: `Bearer ${token}` } : undefined }).then((response) => setMessages((current) => [...current, response.data]));
  };
  return { messages, connected, send };
}
