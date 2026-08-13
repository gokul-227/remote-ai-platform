"use client";

import { Bell, UserPlus, Briefcase, MessageSquare, Heart, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

const ICONS: Record<string, React.ElementType> = {
  connection: UserPlus,
  application: Briefcase,
  job_match: Sparkles,
  match: Sparkles,
  message: MessageSquare,
  comment: MessageSquare,
  like: Heart,
  system: Bell,
};

export interface NotificationData {
  id: string;
  kind: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export function NotificationItem({ notification, onClick }: { notification: NotificationData; onClick?: () => void }) {
  const Icon = ICONS[notification.kind] || ICONS.system;

  return (
    <button onClick={onClick} className="w-full text-left">
      <div
        className={cn(
          "flex items-start gap-3 px-4 py-3 hover:bg-[var(--bg-subtle)] transition-colors",
          !notification.is_read && "bg-[var(--color-brand-light)]/40"
        )}
      >
        <div className="h-9 w-9 rounded-full bg-[var(--color-ai-soft)] flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-[var(--color-ai)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-main)] leading-snug">{notification.title}</p>
          <p className="text-sm text-[var(--text-light)] leading-snug mt-0.5">{notification.body}</p>
          <p className="text-xs text-[var(--text-light)] mt-1">{new Date(notification.created_at).toLocaleString()}</p>
        </div>
        {!notification.is_read && <span className="h-2 w-2 rounded-full bg-[var(--color-brand)] mt-1.5 shrink-0" />}
      </div>
    </button>
  );
}
