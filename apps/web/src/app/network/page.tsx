"use client";

import { useState } from "react";
import {
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  Link2,
  Send,
  Globe,
  Sparkles,
  ArrowRight,
  Shield,
} from "lucide-react";
import { useConnections } from "@/hooks/useConnections";
import { useAuth } from "@/lib/auth";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Connection {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(dateStr?: string) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const initials = name.slice(0, 2).toUpperCase();
  const colors = ["#6d28d9", "#0891b2", "#059669", "#d97706", "#7c3aed", "#0e7490", "#b45309"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.33,
        fontWeight: 700,
        color: "#fff",
        flexShrink: 0,
        letterSpacing: "0.04em",
      }}
    >
      {initials}
    </div>
  );
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  accepted: { label: "Connected", color: "#34d399", bg: "rgba(52,211,153,0.1)", icon: UserCheck },
  pending: { label: "Pending", color: "#facc15", bg: "rgba(250,204,21,0.1)", icon: Clock },
  rejected: { label: "Declined", color: "#f87171", bg: "rgba(248,113,113,0.1)", icon: XCircle },
  blocked: { label: "Blocked", color: "#94a3b8", bg: "rgba(148,163,184,0.1)", icon: Shield },
};

// ── Connection Card ───────────────────────────────────────────────────────────
function ConnectionCard({
  connection,
  currentUserId,
  onAccept,
  onReject,
  accepting,
  rejecting,
}: {
  connection: Connection;
  currentUserId?: string;
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  accepting?: boolean;
  rejecting?: boolean;
}) {
  const isIncoming = connection.receiver_id === currentUserId;
  const otherId = isIncoming ? connection.sender_id : connection.receiver_id;
  const statusConf = STATUS_CONFIG[connection.status] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusConf.icon;

  const isPending = connection.status === "pending";

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 16,
        padding: "18px 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        transition: "all 0.2s",
      }}
      className="connection-card"
    >
      <Avatar name={otherId} size={48} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {otherId.slice(0, 16)}…
          </span>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 10px",
            borderRadius: 20,
            background: statusConf.bg,
            border: `1px solid ${statusConf.color}33`,
            flexShrink: 0,
          }}>
            <StatusIcon size={11} color={statusConf.color} />
            <span style={{ fontSize: 11, fontWeight: 700, color: statusConf.color }}>{statusConf.label}</span>
          </div>
        </div>

        <div style={{ fontSize: 12, color: "#475569" }}>
          {isIncoming ? "Wants to connect with you" : "You sent a request"}
          {connection.created_at && ` · ${timeAgo(connection.created_at)}`}
        </div>

        {isPending && isIncoming && onAccept && onReject && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              onClick={() => onAccept(connection.id)}
              disabled={accepting}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 14px",
                borderRadius: 8,
                border: "none",
                background: "linear-gradient(135deg, #059669, #0d9488)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 3px 12px rgba(5,150,105,0.3)",
                opacity: accepting ? 0.7 : 1,
              }}
            >
              <UserCheck size={12} />
              Accept
            </button>
            <button
              onClick={() => onReject(connection.id)}
              disabled={rejecting}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 14px",
                borderRadius: 8,
                border: "1px solid rgba(248,113,113,0.3)",
                background: "rgba(248,113,113,0.08)",
                color: "#f87171",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                opacity: rejecting ? 0.7 : 1,
              }}
            >
              <UserX size={12} />
              Decline
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Send Request Panel ────────────────────────────────────────────────────────
function SendRequestPanel({ onSend, isPending }: { onSend: (id: string) => void; isPending: boolean }) {
  const [receiverId, setReceiverId] = useState("");

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(79,70,229,0.04) 100%)",
      border: "1px solid rgba(167,139,250,0.2)",
      borderRadius: 16,
      padding: "20px 24px",
      marginBottom: 24,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(167,139,250,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <UserPlus size={17} color="#a78bfa" />
        </div>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>Connect with someone</h3>
          <p style={{ fontSize: 12, color: "#475569", margin: 0 }}>Enter their profile user ID to send a request</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <input
          id="connect-user-id-input"
          value={receiverId}
          onChange={(e) => setReceiverId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && receiverId.trim()) {
              onSend(receiverId.trim());
              setReceiverId("");
            }
          }}
          placeholder="Paste user ID (UUID)…"
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            color: "#e2e8f0",
            fontSize: 13,
            padding: "10px 14px",
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <button
          id="send-connection-request-btn"
          onClick={() => {
            if (receiverId.trim()) {
              onSend(receiverId.trim());
              setReceiverId("");
            }
          }}
          disabled={!receiverId.trim() || isPending}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 18px",
            borderRadius: 10,
            border: "none",
            background: receiverId.trim() ? "linear-gradient(135deg, #7c3aed, #4f46e5)" : "rgba(255,255,255,0.05)",
            color: receiverId.trim() ? "#fff" : "#475569",
            fontSize: 13,
            fontWeight: 700,
            cursor: receiverId.trim() ? "pointer" : "not-allowed",
            boxShadow: receiverId.trim() ? "0 4px 16px rgba(124,58,237,0.3)" : "none",
            transition: "all 0.2s",
            whiteSpace: "nowrap",
          }}
        >
          <Send size={13} />
          {isPending ? "Sending…" : "Send Request"}
        </button>
      </div>
    </div>
  );
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────
function StatsBar({ connections }: { connections: Connection[] }) {
  const accepted = connections.filter((c) => c.status === "accepted").length;
  const pending = connections.filter((c) => c.status === "pending").length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
      {[
        { label: "Connections", value: accepted, icon: UserCheck, color: "#34d399" },
        { label: "Pending", value: pending, icon: Clock, color: "#facc15" },
        { label: "Total", value: connections.length, icon: Users, color: "#a78bfa" },
      ].map(({ label, value, icon: Icon, color }) => (
        <div key={label} style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 14,
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={20} color={color} />
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#f1f5f9", lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function NetworkPage() {
  const { user } = useAuth();
  const connections = useConnections(true);
  const [tab, setTab] = useState<"all" | "connected" | "pending">("all");
  const [search, setSearch] = useState("");

  const allConns = (connections.data ?? []) as Connection[];

  const filtered = allConns.filter((c) => {
    const matchesTab =
      tab === "all" ||
      (tab === "connected" && c.status === "accepted") ||
      (tab === "pending" && c.status === "pending");
    const otherId = c.receiver_id === user?.id ? c.sender_id : c.receiver_id;
    const matchesSearch = !search || otherId.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const pendingIncoming = allConns.filter(
    (c) => c.status === "pending" && c.receiver_id === user?.id
  );

  function handleAccept(id: string) {
    connections.update.mutate({ id, status: "accepted" });
  }

  function handleReject(id: string) {
    connections.update.mutate({ id, status: "rejected" });
  }

  const tabs = [
    { id: "all" as const, label: "All", count: allConns.length },
    { id: "connected" as const, label: "Connected", count: allConns.filter((c) => c.status === "accepted").length },
    { id: "pending" as const, label: "Pending", count: allConns.filter((c) => c.status === "pending").length },
  ];

  return (
    <>
      <style>{`
        .connection-card:hover {
          border-color: rgba(167,139,250,0.2) !important;
          background: rgba(255,255,255,0.04) !important;
        }
        input:focus { border-color: rgba(167,139,250,0.4) !important; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#080e1c", fontFamily: "'Inter', system-ui, sans-serif", color: "#e2e8f0" }}>
        {/* Header */}
        <div style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.02)",
          padding: "24px 32px 0",
        }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ marginBottom: 20 }}>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: "#f1f5f9", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
                Professional Network
              </h1>
              <p style={{ fontSize: 14, color: "#475569", margin: 0 }}>
                Build meaningful connections with engineers and hiring teams
              </p>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 0 }}>
              {tabs.map(({ id, label, count }) => (
                <button
                  key={id}
                  id={`network-tab-${id}`}
                  onClick={() => setTab(id)}
                  style={{
                    padding: "12px 18px",
                    background: "none",
                    border: "none",
                    borderBottom: tab === id ? "2px solid #a78bfa" : "2px solid transparent",
                    color: tab === id ? "#a78bfa" : "#475569",
                    fontSize: 14,
                    fontWeight: tab === id ? 700 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    transition: "all 0.15s",
                  }}
                >
                  {label}
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    background: tab === id ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.05)",
                    color: tab === id ? "#a78bfa" : "#64748b",
                    borderRadius: 20, padding: "1px 7px",
                  }}>{count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 32px" }}>
          {/* Stats */}
          <StatsBar connections={allConns} />

          {/* Send request panel */}
          <SendRequestPanel
            onSend={(id) => connections.request.mutate(id)}
            isPending={connections.request.isPending}
          />

          {/* Error feedback */}
          {connections.request.isError && (
            <div style={{ color: "#f87171", fontSize: 13, marginBottom: 16, padding: "10px 16px", background: "rgba(248,113,113,0.08)", borderRadius: 10, border: "1px solid rgba(248,113,113,0.2)" }}>
              Could not send connection request. The user may already be connected or the ID is invalid.
            </div>
          )}
          {connections.request.isSuccess && (
            <div style={{ color: "#34d399", fontSize: 13, marginBottom: 16, padding: "10px 16px", background: "rgba(52,211,153,0.08)", borderRadius: 10, border: "1px solid rgba(52,211,153,0.2)" }}>
              ✓ Connection request sent!
            </div>
          )}

          {/* Incoming requests highlight */}
          {pendingIncoming.length > 0 && tab !== "pending" && (
            <div style={{
              background: "rgba(250,204,21,0.05)",
              border: "1px solid rgba(250,204,21,0.2)",
              borderRadius: 14,
              padding: "14px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
              cursor: "pointer",
            }}
              onClick={() => setTab("pending")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Clock size={18} color="#facc15" />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#facc15" }}>
                  {pendingIncoming.length} incoming connection request{pendingIncoming.length > 1 ? "s" : ""} waiting
                </span>
              </div>
              <ArrowRight size={16} color="#facc15" />
            </div>
          )}

          {/* Search */}
          <div style={{ position: "relative", marginBottom: 20, maxWidth: 400 }}>
            <Search size={15} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "#475569" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by user ID…"
              style={{
                width: "100%",
                paddingLeft: 40, paddingRight: 14, paddingTop: 10, paddingBottom: 10,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12, color: "#e2e8f0", fontSize: 13, outline: "none",
                fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Connections grid */}
          {connections.isLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 12 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ height: 90, borderRadius: 16, background: "rgba(255,255,255,0.02)", animation: "pulse 2s infinite" }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "64px 24px", color: "#334155" }}>
              <Globe size={44} color="#1e293b" style={{ marginBottom: 14 }} />
              <h3 style={{ fontSize: 18, color: "#475569", margin: "0 0 8px" }}>
                {tab === "all" ? "No connections yet" : tab === "connected" ? "No accepted connections" : "No pending requests"}
              </h3>
              <p style={{ fontSize: 13, margin: 0 }}>
                {tab === "all" && "Send your first connection request above to start building your network."}
                {tab === "connected" && "Accept pending requests or send new ones to grow your network."}
                {tab === "pending" && "No connection requests at the moment."}
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 12 }}>
              {filtered.map((conn) => (
                <ConnectionCard
                  key={conn.id}
                  connection={conn}
                  currentUserId={user?.id}
                  onAccept={handleAccept}
                  onReject={handleReject}
                  accepting={connections.update.isPending}
                  rejecting={connections.update.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
