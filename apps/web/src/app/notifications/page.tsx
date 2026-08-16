"use client";

import { useState } from "react";
import {
  Bell, CheckCheck, Briefcase, Users, MessageSquare, DollarSign,
  FolderKanban, Settings, Heart, UserPlus, Star,
  Filter,
} from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { type NotificationData } from "@/components/NotificationItem";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequireAuth } from "@/components/RequireAuth";
import { cn } from "@/lib/cn";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type NotifCategory = "all" | "jobs" | "network" | "messages" | "projects" | "payments" | "system";

const CATEGORY_CONFIG: Record<string, {
  icon: React.ElementType;
  color: string;
  bg: string;
  label: string;
}> = {
  all: { icon: Bell, color: "text-[var(--text-muted)]", bg: "bg-[var(--bg-subtle)]", label: "All" },
  jobs: { icon: Briefcase, color: "text-[var(--color-brand)]", bg: "bg-[var(--color-brand-light)]", label: "Jobs" },
  network: { icon: Users, color: "text-emerald-600", bg: "bg-emerald-50", label: "Network" },
  messages: { icon: MessageSquare, color: "text-purple-600", bg: "bg-purple-50", label: "Messages" },
  projects: { icon: FolderKanban, color: "text-amber-600", bg: "bg-amber-50", label: "Projects" },
  payments: { icon: DollarSign, color: "text-teal-600", bg: "bg-teal-50", label: "Payments" },
  system: { icon: Settings, color: "text-slate-600", bg: "bg-slate-100", label: "System" },
};

function getNotifIcon(kind: string): { icon: React.ElementType; color: string; bg: string } {
  const k = (kind || "").toLowerCase();
  if (k.includes("job") || k.includes("match") || k.includes("application")) return { icon: Briefcase, color: "text-[var(--color-brand)]", bg: "bg-[var(--color-brand-light)]" };
  if (k.includes("connect") || k.includes("follow") || k.includes("network")) return { icon: UserPlus, color: "text-emerald-600", bg: "bg-emerald-50" };
  if (k.includes("message") || k.includes("chat") || k.includes("comment")) return { icon: MessageSquare, color: "text-purple-600", bg: "bg-purple-50" };
  if (k.includes("payment") || k.includes("escrow") || k.includes("invoice")) return { icon: DollarSign, color: "text-teal-600", bg: "bg-teal-50" };
  if (k.includes("project") || k.includes("task") || k.includes("milestone")) return { icon: FolderKanban, color: "text-amber-600", bg: "bg-amber-50" };
  if (k.includes("like") || k.includes("react")) return { icon: Heart, color: "text-rose-500", bg: "bg-rose-50" };
  if (k.includes("review") || k.includes("star")) return { icon: Star, color: "text-amber-500", bg: "bg-amber-50" };
  return { icon: Bell, color: "text-[var(--text-muted)]", bg: "bg-[var(--bg-subtle)]" };
}

function getCategory(kind: string): string {
  const k = (kind || "").toLowerCase();
  if (k.includes("job") || k.includes("match") || k.includes("application")) return "jobs";
  if (k.includes("connect") || k.includes("follow") || k.includes("network")) return "network";
  if (k.includes("message") || k.includes("chat") || k.includes("comment")) return "messages";
  if (k.includes("project") || k.includes("task") || k.includes("milestone")) return "projects";
  if (k.includes("payment") || k.includes("escrow") || k.includes("invoice")) return "payments";
  return "system";
}

function NotifCard({ notification, onClick }: { notification: NotificationData; onClick: () => void }) {
  const iconConfig = getNotifIcon(notification.kind || "");
  const Icon = iconConfig.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--bg-subtle)] border-b border-[var(--border-color)] last:border-0",
        !notification.is_read && "bg-[var(--color-brand-light)]/30"
      )}
    >
      <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5", iconConfig.bg)}>
        <Icon className={cn("h-4.5 w-4.5", iconConfig.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm leading-snug",
          !notification.is_read ? "font-semibold text-[var(--text-main)]" : "font-medium text-[var(--text-main)]"
        )}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{notification.body}</p>
        )}
        <p className="text-[11px] text-[var(--text-light)] mt-1">{timeAgo(notification.created_at)}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!notification.is_read && (
          <span className="h-2 w-2 rounded-full bg-[var(--color-brand)]" />
        )}
      </div>
    </button>
  );
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <NotificationsContent />
    </RequireAuth>
  );
}

function NotificationsContent() {
  const notifications = useNotifications(true);
  const [activeTab, setActiveTab] = useState<"all" | "unread">("all");
  const [category, setCategory] = useState<NotifCategory>("all");

  const items: NotificationData[] = notifications.data ?? [];
  const unreadCount = items.filter((n) => !n.is_read).length;

  const byRead = activeTab === "unread" ? items.filter((n) => !n.is_read) : items;
  const byCategory = category === "all"
    ? byRead
    : byRead.filter((n) => getCategory(n.kind || "") === category);

  const TABS = [
    { id: "all" as const, label: "All", count: items.length },
    { id: "unread" as const, label: "Unread", count: unreadCount },
  ];

  const CATEGORIES: NotifCategory[] = ["all", "jobs", "network", "messages", "projects", "payments", "system"];

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">Notifications</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}` : "You're all caught up"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              icon={<CheckCheck className="h-3.5 w-3.5" />}
              onClick={() => notifications.markAllRead.mutate()}
              loading={notifications.markAllRead.isPending}
            >
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Read/Unread tabs */}
      <div className="flex items-center gap-0.5 border-b border-[var(--border-color)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === tab.id
                ? "border-[var(--color-brand)] text-[var(--color-brand)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={cn(
                "text-[10px] rounded-full px-1.5 py-0.5 font-semibold",
                activeTab === tab.id ? "bg-[var(--color-brand-light)] text-[var(--color-brand)]" : "bg-[var(--bg-subtle)] text-[var(--text-muted)]"
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Category filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
          <Filter className="h-3.5 w-3.5" /> Filter:
        </span>
        {CATEGORIES.map((cat) => {
          const conf = CATEGORY_CONFIG[cat];
          const Icon = conf.icon;
          const count = cat === "all" ? byRead.length : byRead.filter((n) => getCategory(n.kind || "") === cat).length;
          if (cat !== "all" && count === 0) return null;
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                category === cat
                  ? `${conf.bg} ${conf.color} border-current`
                  : "bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-color)] hover:border-[var(--border-hover)] hover:text-[var(--text-main)]"
              )}
            >
              <Icon className="h-3 w-3" />
              {conf.label}
              {count > 0 && <span className="font-bold">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Notifications */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-[var(--shadow-xs)]">
        {notifications.isLoading ? (
          <div className="divide-y divide-[var(--border-color)]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3.5 animate-pulse">
                <div className="h-9 w-9 rounded-xl bg-[var(--bg-subtle)] shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-[var(--bg-subtle)] rounded w-5/6" />
                  <div className="h-3 bg-[var(--bg-subtle)] rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : byCategory.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={activeTab === "unread" ? "You're all caught up" : category !== "all" ? `No ${CATEGORY_CONFIG[category]?.label} notifications` : "No notifications yet"}
            description={
              activeTab === "unread"
                ? "All notifications have been read."
                : "Activity on your profile, jobs, and network will appear here."
            }
          />
        ) : (
          <div className="divide-y divide-[var(--border-color)]">
            {byCategory.map((n) => (
              <NotifCard
                key={n.id}
                notification={n}
                onClick={() => !n.is_read && notifications.markRead.mutate(n.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
