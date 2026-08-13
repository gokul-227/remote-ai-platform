"use client";

import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationItem, type NotificationData } from "@/components/NotificationItem";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

export default function NotificationsPage() {
  const notifications = useNotifications(true);
  const [tab, setTab] = useState<"all" | "unread">("all");

  const items: NotificationData[] = notifications.data ?? [];
  const unreadCount = items.filter((n) => !n.is_read).length;
  const filtered = tab === "unread" ? items.filter((n) => !n.is_read) : items;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Bell className="h-5 w-5 text-[#0A66C2]" /> Notifications
          </h1>
          <p className="text-xs text-slate-500 mt-1">Connection requests, matches, messages, and platform updates.</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" size="sm" icon={<CheckCheck className="h-3.5 w-3.5" />} onClick={() => notifications.markAllRead.mutate()}>
            Mark all read
          </Button>
        )}
      </div>

      <Tabs
        items={[
          { key: "all", label: "All", count: items.length },
          { key: "unread", label: "Unread", count: unreadCount },
        ]}
        active={tab}
        onChange={(k) => setTab(k as typeof tab)}
      />

      <div className="card-enterprise divide-y divide-[var(--border-color)] overflow-hidden">
        {notifications.isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={tab === "unread" ? "You're all caught up" : "No notifications yet"}
            description={tab === "unread" ? "New notifications will appear here as they arrive." : "Activity on your profile, jobs, and network will show up here."}
          />
        ) : (
          filtered.map((n) => (
            <NotificationItem key={n.id} notification={n} onClick={() => !n.is_read && notifications.markRead.mutate(n.id)} />
          ))
        )}
      </div>
    </div>
  );
}
