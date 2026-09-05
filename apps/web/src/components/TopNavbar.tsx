"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Search,
  Bell,
  Menu,
  Briefcase,
  User,
  Building2,
  Shield,
  ChevronDown,
  LogOut,
  Settings,
  Home,
  Users,
  MessageSquare,
  FolderKanban,
  Sparkles,
  Globe,
  FileText,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { useNotifications } from "@/hooks/useNotifications";
import { useSearch } from "@/hooks/useSearch";
import { Avatar } from "@/components/ui/Avatar";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";

interface TopNavbarProps {
  onMenuClick?: () => void;
  onSearchClick?: () => void;
}

export function TopNavbar({ onMenuClick, onSearchClick }: TopNavbarProps) {
  const { user, logout } = useAuth();
  const notifications = useNotifications(!!user);
  const router = useRouter();
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchVal, setSearchVal] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const search = useSearch(searchVal, searchOpen);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchVal.trim()) {
      setSearchOpen(false);
      router.push(`/jobs?query=${encodeURIComponent(searchVal.trim())}`);
    }
  };

  const searchResults = search.data
    ? [
        ...search.data.jobs.slice(0, 4).map((j) => ({ id: j.id, kind: "Job" as const, title: j.title, subtitle: j.company_name, href: `/jobs/${j.id}` })),
        ...search.data.engineers.slice(0, 4).map((e) => ({ id: e.id, kind: "Person" as const, title: e.full_name, subtitle: e.headline, href: `/engineers/${e.id}` })),
      ]
    : [];

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      logout();
    }
    router.push("/");
  };

  const navItems = !user
    ? [
        { name: "Jobs", href: "/jobs", icon: Briefcase },
        { name: "Professionals", href: "/engineers", icon: Users },
        { name: "Organizations", href: "/companies", icon: Globe },
      ]
    : user?.role === "COMPANY"
      ? [
          { name: "Home", href: "/", icon: Home },
          { name: "Feed", href: "/feed", icon: MessageSquare },
          { name: "My Jobs", href: "/company/jobs", icon: Briefcase },
          { name: "Candidates", href: "/company/candidates", icon: Users },
          { name: "Contracts", href: "/contracts", icon: FileText },
          { name: "Communities", href: "/groups", icon: Globe },
          { name: "Network", href: "/network", icon: Users },
          { name: "Projects", href: "/projects", icon: FolderKanban },
          { name: "Messages", href: "/messages", icon: MessageSquare },
        ]
      : [
          { name: "Home", href: "/", icon: Home },
          { name: "Feed", href: "/feed", icon: MessageSquare },
          { name: "Jobs", href: "/jobs", icon: Briefcase },
          { name: "Professionals", href: "/engineers", icon: Users },
          { name: "Contracts", href: "/contracts", icon: FileText },
          { name: "Communities", href: "/groups", icon: Globe },
          ...(user?.role === "ENGINEER"
            ? [{ name: "For You", href: "/engineer/recommendations", icon: Sparkles }]
            : []),
          { name: "Network", href: "/network", icon: Users },
          { name: "Projects", href: "/projects", icon: FolderKanban },
          { name: "Messages", href: "/messages", icon: MessageSquare },
        ];

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-[var(--bg-surface)] border-b border-slate-200 dark:border-[var(--border-color)] px-4 py-1.5 shadow-xs">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Logo + Search */}
        <div className="flex items-center gap-3 flex-1 max-w-xl">
          <button
            onClick={onMenuClick}
            className="md:hidden p-1.5 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="h-9 w-9 rounded-lg bg-[#B54A2C] flex items-center justify-center text-white font-black text-xl shadow-xs">
              R
            </div>
            <span className="hidden sm:inline font-bold text-lg text-slate-900 dark:text-white tracking-tight">
              Remote <span className="text-[#B54A2C]">AI Platform</span>
            </span>
          </Link>

          {user && (user.role === "ENGINEER" || user.role === "COMPANY") && (
            <>
              <div className="hidden lg:block h-6 w-px bg-[var(--border-color)]" aria-hidden="true" />
              <WorkspaceSwitcher />
            </>
          )}

          {/* Global Search Bar */}
          <form onSubmit={handleSearch} className="flex-1 hidden md:block relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 120)}
                placeholder="Search jobs, people, organizations, skills..."
                className="input-enterprise pl-10 pr-12 py-1.5 text-xs bg-slate-100 dark:bg-[var(--bg-subtle)] focus:bg-white dark:focus:bg-[var(--bg-surface)] border-transparent focus:border-[#B54A2C]"
              />
              <button
                type="button"
                onClick={onSearchClick}
                title="Open command palette"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-6 min-w-6 flex items-center justify-center text-[10px] text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 hover:border-slate-400 hover:text-slate-800 dark:hover:text-slate-300"
              >
                ⌘K
              </button>
            </div>

            {searchOpen && searchVal.trim().length > 1 && (
              <div className="absolute left-0 right-0 mt-1.5 surface-elevated overflow-hidden animate-fade-in z-50">
                {search.isLoading ? (
                  <p className="px-4 py-3 text-xs text-slate-500">Searching…</p>
                ) : searchResults.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-slate-500">No results for &ldquo;{searchVal}&rdquo;.</p>
                ) : (
                  <div className="py-1">
                    {searchResults.map((r) => (
                      <Link
                        key={`${r.kind}-${r.id}`}
                        href={r.href}
                        onMouseDown={() => setSearchOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50"
                      >
                        <span className="badge-ent badge-ent-neutral text-[10px]">{r.kind}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-900 truncate">{r.title}</p>
                          {r.subtitle && <p className="text-[11px] text-slate-500 truncate">{r.subtitle}</p>}
                        </div>
                      </Link>
                    ))}
                    <button
                      type="submit"
                      onMouseDown={() => setSearchOpen(false)}
                      className="w-full text-left px-4 py-2 text-xs font-semibold text-[#B54A2C] hover:bg-slate-50 border-t border-slate-100"
                    >
                      See all results for &ldquo;{searchVal}&rdquo;
                    </button>
                  </div>
                )}
              </div>
            )}
          </form>
        </div>

        {/* Center Navigation */}
        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex flex-col items-center px-3 py-1 text-[11px] font-medium transition-colors relative ${
                  isActive
                    ? "text-[#B54A2C] border-b-2 border-[#B54A2C]"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5 mb-0.5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onSearchClick}
            aria-label="Search"
            className="md:hidden p-2 rounded-full text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Search className="h-5 w-5" />
          </button>
          <ThemeToggle />
          {/* Notifications */}
          {user && (
          <div className="relative">
            <button
              onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
              className="p-2 rounded-full text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 relative"
              title="Notifications"
            >
              <Bell className="h-5 w-5" />
              {(notifications.unread.data?.count ?? 0) > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#B54A2C]" />}
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-[var(--surface-elevated)] rounded-xl shadow-lg border border-slate-200 dark:border-[var(--border-color)] p-4 z-50 animate-fade-in">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-[var(--border-color)] mb-3">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</h4>
                  <button onClick={() => notifications.markAllRead.mutate()} className="text-xs text-[#B54A2C] cursor-pointer hover:underline">Mark all read</button>
                </div>
                <div className="space-y-2.5">
                  {notifications.data?.length ? notifications.data.map((n: { id: string; title: string; body: string; is_read?: boolean }) => (
                    <button onClick={() => notifications.markRead.mutate(n.id)} key={n.id} className={`flex w-full items-start gap-2.5 p-2 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-[var(--bg-subtle)] cursor-pointer ${n.is_read ? "opacity-60" : ""}`}>
                      <div className="h-2 w-2 rounded-full bg-[#B54A2C] mt-1.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">{n.title}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{n.body}</p>
                      </div>
                    </button>
                  )) : <p className="text-xs text-slate-500">No new notifications.</p>}
                </div>
                <Link
                  href="/notifications"
                  onClick={() => setNotifOpen(false)}
                  className="block text-center text-xs font-semibold text-[#B54A2C] hover:underline mt-3 pt-3 border-t border-slate-100 dark:border-[var(--border-color)]"
                >
                  View all notifications
                </Link>
              </div>
            )}
          </div>
          )}

          {/* User profile dropdown or Sign in button */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
                className="flex items-center gap-1.5 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Avatar name={user.full_name || "User"} size="sm" />
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-[var(--surface-elevated)] rounded-xl shadow-lg border border-slate-200 dark:border-[var(--border-color)] py-2 z-50">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-[var(--border-color)]">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user.full_name}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  </div>
                  <div className="py-1 text-xs">
                    {user?.role === "COMPANY" ? (
                      <>
                        <Link
                          href="/company/profile"
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[var(--bg-subtle)]"
                        >
                          <Building2 className="h-4 w-4 text-slate-500" />
                          Organization Profile
                        </Link>
                        <Link
                          href="/company/dashboard"
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[var(--bg-subtle)]"
                        >
                          <Briefcase className="h-4 w-4 text-slate-500" />
                          Hiring Dashboard
                        </Link>
                      </>
                    ) : user?.role !== "ADMIN" ? (
                      <>
                        <Link
                          href="/engineer/profile"
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[var(--bg-subtle)]"
                        >
                          <User className="h-4 w-4 text-slate-500" />
                          My Profile
                        </Link>
                        <Link
                          href="/engineer/dashboard"
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[var(--bg-subtle)]"
                        >
                          <Briefcase className="h-4 w-4 text-slate-500" />
                          Career Dashboard
                        </Link>
                      </>
                    ) : null}
                    {user?.role === "ADMIN" && (
                      <Link
                        href="/admin/dashboard"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[var(--bg-subtle)]"
                      >
                        <Shield className="h-4 w-4 text-slate-500" />
                        Admin Console
                      </Link>
                    )}
                  </div>
                  <div className="border-t border-slate-100 dark:border-[var(--border-color)] pt-1">
                    <Link
                      href="/settings"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[var(--bg-subtle)] text-xs"
                    >
                      <Settings className="h-4 w-4 text-slate-500" />
                      Settings
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/auth/login" className="btn-subtle text-xs font-semibold">
                Sign In
              </Link>
              <Link href="/auth/register" className="btn-secondary-brand text-xs px-3 py-1">
                Join Now
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
