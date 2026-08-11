"use client";

import { useState } from "react";
import {
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Clock,
  XCircle,
  Search,
  Send,
  Globe,
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

const AVATAR_COLORS = ["#0A66C2", "#0891b2", "#059669", "#b45309", "#7c3aed", "#0e7490", "#be123c"];

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name.slice(0, 2).toUpperCase();
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div
      style={{ width: size, height: size, background: color, fontSize: size * 0.33 }}
      className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
    >
      {initials}
    </div>
  );
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  accepted: { label: "Connected", className: "badge-ent-success", icon: UserCheck },
  pending: { label: "Pending", className: "badge-ent-warning", icon: Clock },
  rejected: { label: "Declined", className: "badge-ent-neutral", icon: XCircle },
  blocked: { label: "Blocked", className: "badge-ent-neutral", icon: Shield },
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
    <div className="card-enterprise p-4 flex items-center gap-4">
      <Avatar name={otherId} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-sm font-bold text-slate-900 truncate">{otherId.slice(0, 16)}…</span>
          <span className={`badge-ent ${statusConf.className} flex items-center gap-1 flex-shrink-0`}>
            <StatusIcon className="h-3 w-3" />
            {statusConf.label}
          </span>
        </div>
        <div className="text-xs text-slate-500">
          {isIncoming ? "Wants to connect with you" : "You sent a request"}
          {connection.created_at && ` · ${timeAgo(connection.created_at)}`}
        </div>
        {isPending && isIncoming && onAccept && onReject && (
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={() => onAccept(connection.id)}
              disabled={accepting}
              className="btn-primary-brand text-xs px-3 py-1.5 disabled:opacity-70"
            >
              <UserCheck className="h-3 w-3" /> Accept
            </button>
            <button
              onClick={() => onReject(connection.id)}
              disabled={rejecting}
              className="btn-secondary-brand text-xs px-3 py-1.5 disabled:opacity-70"
            >
              <UserX className="h-3 w-3" /> Decline
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

  const submit = () => {
    if (receiverId.trim()) {
      onSend(receiverId.trim());
      setReceiverId("");
    }
  };

  return (
    <div className="card-enterprise p-5">
      <div className="flex items-center gap-3 mb-3.5">
        <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
          <UserPlus className="h-4 w-4 text-[#0A66C2]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Connect with someone</h3>
          <p className="text-xs text-slate-500">Enter their profile user ID to send a request</p>
        </div>
      </div>
      <div className="flex gap-2.5">
        <input
          id="connect-user-id-input"
          value={receiverId}
          onChange={(e) => setReceiverId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Paste user ID (UUID)…"
          className="input-enterprise flex-1"
        />
        <button
          id="send-connection-request-btn"
          onClick={submit}
          disabled={!receiverId.trim() || isPending}
          className="btn-primary-brand text-sm px-4 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <Send className="h-3.5 w-3.5" />
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

  const stats = [
    { label: "Connections", value: accepted, icon: UserCheck, color: "text-emerald-600" },
    { label: "Pending", value: pending, icon: Clock, color: "text-amber-600" },
    { label: "Total", value: connections.length, icon: Users, color: "text-[#0A66C2]" },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {stats.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="card-enterprise p-4 flex items-center gap-3.5">
          <div className={`${color}`}><Icon className="h-5 w-5" /></div>
          <div>
            <div className="text-2xl font-bold text-slate-900 leading-none">{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Professional Network</h1>
        <p className="text-sm text-slate-500 mt-1">Build meaningful connections with engineers and hiring teams</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map(({ id, label, count }) => (
          <button
            key={id}
            id={`network-tab-${id}`}
            onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              tab === id ? "border-[#0A66C2] text-[#0A66C2]" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
            <span className={`text-[11px] font-bold rounded-full px-1.5 py-0.5 ${tab === id ? "bg-blue-100 text-[#0A66C2]" : "bg-slate-100 text-slate-500"}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      <StatsBar connections={allConns} />

      <SendRequestPanel onSend={(id) => connections.request.mutate(id)} isPending={connections.request.isPending} />

      {connections.request.isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          Could not send connection request. The user may already be connected or the ID is invalid.
        </div>
      )}
      {connections.request.isSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-4 py-3">
          Connection request sent.
        </div>
      )}

      {pendingIncoming.length > 0 && tab !== "pending" && (
        <button
          onClick={() => setTab("pending")}
          className="w-full flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5 text-left hover:border-amber-300 transition-colors"
        >
          <span className="flex items-center gap-2.5 text-sm font-semibold text-amber-700">
            <Clock className="h-4 w-4" />
            {pendingIncoming.length} incoming connection request{pendingIncoming.length > 1 ? "s" : ""} waiting
          </span>
          <ArrowRight className="h-4 w-4 text-amber-600" />
        </button>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by user ID…"
          className="input-enterprise pl-10"
        />
      </div>

      {connections.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-box h-[90px] rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Globe className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-700 mb-1.5">
            {tab === "all" ? "No connections yet" : tab === "connected" ? "No accepted connections" : "No pending requests"}
          </h3>
          <p className="text-sm text-slate-500">
            {tab === "all" && "Send your first connection request above to start building your network."}
            {tab === "connected" && "Accept pending requests or send new ones to grow your network."}
            {tab === "pending" && "No connection requests at the moment."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
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
  );
}
