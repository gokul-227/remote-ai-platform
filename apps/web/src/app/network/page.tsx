"use client";

import { useState } from "react";
import {
  Users, UserPlus, UserCheck, UserX, Clock, XCircle, Search, Send, Globe, ArrowRight, Shield,
} from "lucide-react";
import { useConnections } from "@/hooks/useConnections";
import { useFreelancers } from "@/hooks/useFreelancers";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { StatusBadge, type StatusTone } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { UserCard } from "@/components/UserCard";
import type { EngineerProfile } from "@/types";

interface Connection {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at?: string;
}

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

const STATUS_CONFIG: Record<string, { label: string; tone: StatusTone; icon: React.ElementType }> = {
  accepted: { label: "Connected", tone: "success", icon: UserCheck },
  pending: { label: "Pending", tone: "warning", icon: Clock },
  rejected: { label: "Declined", tone: "neutral", icon: XCircle },
  blocked: { label: "Blocked", tone: "neutral", icon: Shield },
};

function ConnectionCard({
  connection, currentUserId, onAccept, onReject, accepting, rejecting,
}: {
  connection: Connection; currentUserId?: string;
  onAccept?: (id: string) => void; onReject?: (id: string) => void;
  accepting?: boolean; rejecting?: boolean;
}) {
  const isIncoming = connection.receiver_id === currentUserId;
  const otherId = isIncoming ? connection.sender_id : connection.receiver_id;
  const statusConf = STATUS_CONFIG[connection.status] ?? STATUS_CONFIG.pending;
  const isPending = connection.status === "pending";

  return (
    <div className="card-enterprise p-4 flex items-center gap-4">
      <Avatar name={otherId} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-sm font-bold text-slate-900 truncate">{otherId.slice(0, 16)}…</span>
          <StatusBadge label={statusConf.label} tone={statusConf.tone} />
        </div>
        <div className="text-xs text-slate-500">
          {isIncoming ? "Wants to connect with you" : "You sent a request"}
          {connection.created_at && ` · ${timeAgo(connection.created_at)}`}
        </div>
        {isPending && isIncoming && onAccept && onReject && (
          <div className="flex gap-2 mt-2.5">
            <Button size="sm" onClick={() => onAccept(connection.id)} loading={accepting} icon={<UserCheck className="h-3 w-3" />}>Accept</Button>
            <Button size="sm" variant="secondary" onClick={() => onReject(connection.id)} disabled={rejecting} icon={<UserX className="h-3 w-3" />}>Decline</Button>
          </div>
        )}
      </div>
    </div>
  );
}

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
          value={receiverId}
          onChange={(e) => setReceiverId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Paste user ID (UUID)…"
          className="input-enterprise flex-1"
        />
        <Button onClick={submit} disabled={!receiverId.trim()} loading={isPending} icon={<Send className="h-3.5 w-3.5" />}>
          Send Request
        </Button>
      </div>
    </div>
  );
}

export default function NetworkPage() {
  const { user } = useAuth();
  const connections = useConnections(true);
  const suggestions = useFreelancers({ openOnly: true });
  const [tab, setTab] = useState<"all" | "connected" | "pending" | "suggestions">("suggestions");
  const [search, setSearch] = useState("");

  const allConns = (connections.data ?? []) as Connection[];
  const suggestedPeople: EngineerProfile[] = (suggestions.data ?? []).slice(0, 12);

  const filtered = allConns.filter((c) => {
    const matchesTab = tab === "all" || (tab === "connected" && c.status === "accepted") || (tab === "pending" && c.status === "pending");
    const otherId = c.receiver_id === user?.id ? c.sender_id : c.receiver_id;
    const matchesSearch = !search || otherId.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const pendingIncoming = allConns.filter((c) => c.status === "pending" && c.receiver_id === user?.id);

  const tabs = [
    { key: "suggestions", label: "People you may know", count: suggestedPeople.length },
    { key: "all", label: "All", count: allConns.length },
    { key: "connected", label: "Connections", count: allConns.filter((c) => c.status === "accepted").length },
    { key: "pending", label: "Pending", count: allConns.filter((c) => c.status === "pending").length },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Professional Network</h1>
        <p className="text-sm text-slate-500 mt-1">Build meaningful connections with engineers and hiring teams.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Connections", value: allConns.filter((c) => c.status === "accepted").length, icon: UserCheck, color: "text-emerald-600" },
          { label: "Pending", value: allConns.filter((c) => c.status === "pending").length, icon: Clock, color: "text-amber-600" },
          { label: "Total", value: allConns.length, icon: Users, color: "text-[#0A66C2]" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card-enterprise p-4 flex items-center gap-3.5">
            <div className={color}><Icon className="h-5 w-5" /></div>
            <div>
              <div className="text-2xl font-bold text-slate-900 leading-none">{value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{label}</div>
            </div>
          </div>
        ))}
      </div>

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

      <Tabs items={tabs} active={tab} onChange={(k) => setTab(k as typeof tab)} />

      {tab === "suggestions" ? (
        suggestions.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
          </div>
        ) : suggestedPeople.length === 0 ? (
          <div className="card-enterprise"><EmptyState icon={Users} title="No suggestions right now" description="Check back soon as more engineers join the platform." /></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suggestedPeople.map((person) => (
              <UserCard
                key={person.id}
                profile={person}
                actionLabel="Connect"
                onAction={() => person.user_id && connections.request.mutate(person.user_id)}
              />
            ))}
          </div>
        )
      ) : (
        <>
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

          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by user ID…" className="input-enterprise pl-10" />
          </div>

          {connections.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[90px] w-full rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="card-enterprise">
              <EmptyState
                icon={Globe}
                title={tab === "all" ? "No connections yet" : tab === "connected" ? "No accepted connections" : "No pending requests"}
                description={
                  tab === "all" ? "Send your first connection request above to start building your network."
                  : tab === "connected" ? "Accept pending requests or send new ones to grow your network."
                  : "No connection requests at the moment."
                }
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((conn) => (
                <ConnectionCard
                  key={conn.id}
                  connection={conn}
                  currentUserId={user?.id}
                  onAccept={(id) => connections.update.mutate({ id, status: "ACCEPTED" })}
                  onReject={(id) => connections.update.mutate({ id, status: "REJECTED" })}
                  accepting={connections.update.isPending}
                  rejecting={connections.update.isPending}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
