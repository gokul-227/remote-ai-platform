"use client";

import { useState } from "react";
import {
  Users, UserPlus, UserCheck, Clock, XCircle, Search, Send,
  Globe, ArrowRight, Shield, MessageSquare, Sparkles, MapPin,
} from "lucide-react";
import { useConnections } from "@/hooks/useConnections";
import { useFreelancers } from "@/hooks/useFreelancers";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { StatusBadge, type StatusTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

import type { EngineerProfile } from "@/types";
import { cn } from "@/lib/cn";

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
  const isAccepted = connection.status === "accepted";

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-4 flex items-start gap-3 hover:shadow-[var(--shadow-sm)] transition-shadow">
      <Avatar name={otherId} size="lg" />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-main)] truncate">{otherId.slice(0, 14)}…</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {isIncoming ? "Wants to connect" : "Request sent"}
              {connection.created_at && ` · ${timeAgo(connection.created_at)}`}
            </p>
          </div>
          <StatusBadge label={statusConf.label} tone={statusConf.tone} />
        </div>
        {isPending && isIncoming && onAccept && onReject ? (
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={() => onAccept(connection.id)} loading={accepting}>Accept</Button>
            <Button size="sm" variant="secondary" onClick={() => onReject(connection.id)} disabled={rejecting}>Ignore</Button>
            <Button size="sm" variant="secondary" icon={<MessageSquare className="h-3 w-3" />}>Message</Button>
          </div>
        ) : isAccepted ? (
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="secondary" icon={<MessageSquare className="h-3 w-3" />}>Message</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SendRequestPanel({ onSend, isPending }: { onSend: (id: string) => void; isPending: boolean }) {
  const [receiverId, setReceiverId] = useState("");
  const submit = () => {
    if (receiverId.trim()) { onSend(receiverId.trim()); setReceiverId(""); }
  };

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-9 w-9 rounded-lg bg-[var(--color-brand-light)] flex items-center justify-center">
          <UserPlus className="h-4 w-4 text-[var(--color-brand)]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-main)]">Connect with someone</h3>
          <p className="text-xs text-[var(--text-muted)]">Enter their user ID to send a connection request</p>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          value={receiverId}
          onChange={(e) => setReceiverId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Paste user ID…"
          className="input-enterprise flex-1 text-sm"
        />
        <Button onClick={submit} disabled={!receiverId.trim()} loading={isPending} icon={<Send className="h-3.5 w-3.5" />}>
          Send
        </Button>
      </div>
    </div>
  );
}

function SuggestionCard({ person, onConnect, connecting }: {
  person: EngineerProfile;
  onConnect: () => void;
  connecting: boolean;
}) {
  const skills = (person.skills || []).slice(0, 3);
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden hover:shadow-[var(--shadow-md)] transition-shadow group">
      <div className="h-12 bg-gradient-to-br from-[#0A66C2]/20 via-[#7F56D9]/10 to-emerald-500/10" />
      <div className="px-4 pb-4">
        <div className="-mt-5 mb-2">
          <Avatar name={person.full_name || "Engineer"} size="lg" className="ring-2 ring-[var(--bg-surface)]" />
        </div>
        <p className="text-sm font-semibold text-[var(--text-main)] leading-tight">{person.full_name || "Engineer"}</p>
        {person.headline && (
          <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-1">{person.headline}</p>
        )}
        {person.location && (
          <p className="text-[10px] text-[var(--text-light)] flex items-center gap-1 mt-1">
            <MapPin className="h-3 w-3" /> {person.location}
          </p>
        )}
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {skills.map((s) => (
              <span key={s} className="text-[10px] bg-[var(--bg-subtle)] border border-[var(--border-color)] text-[var(--text-muted)] rounded px-1.5 py-0.5">{s}</span>
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <Button size="sm" fullWidth onClick={onConnect} loading={connecting} icon={<UserPlus className="h-3.5 w-3.5" />}>
            Connect
          </Button>
          <a
            href={`/engineers/${person.id}`}
            className="flex-none h-7 px-2.5 flex items-center text-xs font-medium border border-[var(--border-color)] rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            View
          </a>
        </div>
      </div>
    </div>
  );
}

export default function NetworkPage() {
  return (
    <RequireAuth>
      <NetworkContent />
    </RequireAuth>
  );
}

function NetworkContent() {
  const { user } = useAuth();
  const connections = useConnections(true);
  const suggestions = useFreelancers({ openOnly: true });
  const [tab, setTab] = useState<"suggestions" | "all" | "connected" | "pending">("suggestions");
  const [search, setSearch] = useState("");

  const allConns = (connections.data ?? []) as Connection[];
  const suggestedPeople: EngineerProfile[] = (suggestions.data ?? []).slice(0, 12);

  const acceptedCount = allConns.filter((c) => c.status === "accepted").length;
  const pendingCount = allConns.filter((c) => c.status === "pending").length;
  const incomingPending = allConns.filter((c) => c.status === "pending" && c.receiver_id === user?.id);

  const filtered = allConns.filter((c) => {
    const matchTab = tab === "all" || (tab === "connected" && c.status === "accepted") || (tab === "pending" && c.status === "pending");
    const otherId = c.receiver_id === user?.id ? c.sender_id : c.receiver_id;
    const matchSearch = !search || otherId.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const TABS = [
    { key: "suggestions", label: "Discover", count: suggestedPeople.length },
    { key: "all", label: "All", count: allConns.length },
    { key: "connected", label: "Connections", count: acceptedCount },
    { key: "pending", label: "Invitations", count: pendingCount },
  ];

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">My Network</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {acceptedCount === 0
              ? "Start building your professional network"
              : `You have ${acceptedCount} connection${acceptedCount !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setTab("all")}>
          Add Connection
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Connections", value: acceptedCount, icon: UserCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Invitations", value: pendingCount, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Discovered", value: suggestedPeople.length, icon: Sparkles, color: "text-[var(--color-ai)]", bg: "bg-[var(--color-ai-soft)]" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-4 flex items-center gap-3">
            <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", bg)}>
              <Icon className={cn("h-4.5 w-4.5", color)} />
            </div>
            <div>
              <p className="text-xl font-bold text-[var(--text-main)] leading-none">{value}</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Incoming alert */}
      {incomingPending.length > 0 && tab !== "pending" && (
        <button
          onClick={() => setTab("pending")}
          className="w-full flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5 text-left hover:border-amber-300 transition-colors"
        >
          <span className="flex items-center gap-2.5 text-sm font-semibold text-amber-700">
            <Clock className="h-4 w-4" />
            {incomingPending.length} pending invitation{incomingPending.length > 1 ? "s" : ""} waiting for your response
          </span>
          <ArrowRight className="h-4 w-4 text-amber-600" />
        </button>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-0.5 border-b border-[var(--border-color)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              tab === t.key
                ? "border-[var(--color-brand)] text-[var(--color-brand)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span className={cn(
                "text-[10px] rounded-full px-1.5 py-0.5 font-semibold",
                tab === t.key ? "bg-[var(--color-brand-light)] text-[var(--color-brand)]" : "bg-[var(--bg-subtle)] text-[var(--text-muted)]"
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "suggestions" ? (
        suggestions.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 w-full rounded-xl" />)}
          </div>
        ) : suggestedPeople.length === 0 ? (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl">
            <EmptyState icon={Users} title="No suggestions right now" description="Check back soon as more engineers join the platform." />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {suggestedPeople.map((person) => (
              <SuggestionCard
                key={person.id}
                person={person}
                onConnect={() => person.user_id && connections.request.mutate(person.user_id)}
                connecting={connections.request.isPending}
              />
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <SendRequestPanel onSend={(id) => connections.request.mutate(id)} isPending={connections.request.isPending} />

          {connections.request.isError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              Could not send connection request. The user may already be connected or the ID is invalid.
            </div>
          )}
          {connections.request.isSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-4 py-3">
              ✓ Connection request sent successfully.
            </div>
          )}

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-light)] pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search connections…"
              className="input-enterprise pl-9 text-sm"
            />
          </div>

          {connections.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl">
              <EmptyState
                icon={tab === "pending" ? Clock : Globe}
                title={tab === "all" ? "No connections yet" : tab === "connected" ? "No accepted connections" : "No pending requests"}
                description={tab === "all" ? "Send your first request above." : tab === "connected" ? "Accept pending requests to grow your network." : "No requests at the moment."}
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
        </div>
      )}
    </div>
  );
}
