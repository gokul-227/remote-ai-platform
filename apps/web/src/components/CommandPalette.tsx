"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Home, Briefcase, Users, MessageSquare, FolderKanban, Globe, FileText,
  Bell, Settings, User, Building2, Sparkles, Shield, Bookmark, LogOut, ArrowRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useSearch } from "@/hooks/useSearch";
import api from "@/lib/api";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ElementType;
  action: () => void;
  keywords?: string;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useSearch(query, open);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  const go = (href: string) => {
    router.push(href);
    onClose();
  };

  const staticCommands: Command[] = useMemo(() => {
    const base: Command[] = [
      { id: "feed", label: "Feed", icon: Home, action: () => go("/feed") },
      { id: "jobs", label: "Jobs", icon: Briefcase, action: () => go("/jobs") },
      { id: "network", label: "Network", icon: Users, action: () => go("/network") },
      { id: "messages", label: "Messages", icon: MessageSquare, action: () => go("/messages") },
      { id: "notifications", label: "Notifications", icon: Bell, action: () => go("/notifications") },
      { id: "projects", label: "Projects", icon: FolderKanban, action: () => go("/projects") },
      { id: "contracts", label: "Contracts", icon: FileText, action: () => go("/contracts") },
      { id: "communities", label: "Communities", icon: Globe, action: () => go("/groups") },
      { id: "engineers", label: "Discover Engineers", icon: Users, action: () => go("/engineers"), keywords: "talent people" },
      { id: "companies", label: "Discover Companies", icon: Building2, action: () => go("/companies") },
      { id: "settings", label: "Settings", icon: Settings, action: () => go("/settings") },
    ];

    if (!user) {
      return [
        { id: "signin", label: "Sign In", icon: User, action: () => go("/auth/login") },
        { id: "signup", label: "Join Now", icon: Sparkles, action: () => go("/auth/register") },
        ...base,
      ];
    }

    const roleCommands: Command[] =
      user.role === "COMPANY"
        ? [
            { id: "company-dashboard", label: "Hiring Dashboard", icon: Home, action: () => go("/company/dashboard") },
            { id: "company-profile", label: "Company Profile", icon: Building2, action: () => go("/company/profile") },
            { id: "company-jobs", label: "My Job Postings", icon: Briefcase, action: () => go("/company/jobs") },
            { id: "company-candidates", label: "Candidate Discovery", icon: Users, action: () => go("/company/candidates") },
            { id: "post-job", label: "Post a Job", icon: Sparkles, action: () => go("/jobs/new") },
          ]
        : user.role === "ADMIN"
          ? [
              { id: "admin-dashboard", label: "Admin Console", icon: Shield, action: () => go("/admin/dashboard") },
              { id: "admin-users", label: "User Management", icon: Users, action: () => go("/admin/users") },
              { id: "admin-jobs", label: "Job Listings", icon: Briefcase, action: () => go("/admin/jobs") },
              { id: "quality", label: "AI Quality Engine", icon: Sparkles, action: () => go("/quality") },
            ]
          : [
              { id: "engineer-dashboard", label: "Career Dashboard", icon: Home, action: () => go("/engineer/dashboard") },
              { id: "engineer-profile", label: "My Profile", icon: User, action: () => go("/engineer/profile") },
              { id: "engineer-matches", label: "AI Matches", icon: Sparkles, action: () => go("/engineer/recommendations") },
              { id: "engineer-applications", label: "My Applications", icon: FileText, action: () => go("/engineer/applications") },
              { id: "saved-jobs", label: "Saved Jobs", icon: Bookmark, action: () => go("/jobs?saved=true") },
              { id: "engineer-workspace", label: "Execution Workspace", icon: FolderKanban, action: () => go("/engineer/workspace") },
            ];

    return [
      ...roleCommands,
      ...base,
      {
        id: "sign-out",
        label: "Sign Out",
        icon: LogOut,
        action: () => {
          void api.post("/auth/logout").finally(() => {
            logout();
            go("/");
          });
        },
      },
    ];
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredCommands = query.trim()
    ? staticCommands.filter((c) => (c.label + " " + (c.keywords ?? "")).toLowerCase().includes(query.toLowerCase()))
    : staticCommands;

  const searchResults = search.data
    ? [
        ...search.data.jobs.slice(0, 4).map((j) => ({ id: `job-${j.id}`, label: j.title, hint: j.company_name ?? "", icon: Briefcase, action: () => go(`/jobs/${j.id}`) })),
        ...search.data.engineers.slice(0, 4).map((e) => ({ id: `eng-${e.id}`, label: e.full_name, hint: e.headline ?? "", icon: User, action: () => go(`/engineers/${e.id}`) })),
      ]
    : [];

  const allItems: Command[] = query.trim().length > 1 ? [...searchResults, ...filteredCommands] : filteredCommands;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      allItems[activeIndex]?.action();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] px-4 bg-black/40 animate-fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="surface-elevated w-full max-w-lg max-h-[70vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border-color)]">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search jobs, people, or jump to a page…"
            className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 outline-none"
          />
          <kbd className="text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div className="flex-1 overflow-y-auto py-1.5">
          {allItems.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">No results for &ldquo;{query}&rdquo;.</p>
          ) : (
            allItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={item.action}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === activeIndex ? "bg-[var(--color-brand-light)]" : "hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="flex-1 text-sm text-slate-800 truncate">{item.label}</span>
                  {item.hint && <span className="text-xs text-slate-400 truncate">{item.hint}</span>}
                  {i === activeIndex && <ArrowRight className="h-3.5 w-3.5 text-[var(--color-brand)] shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
