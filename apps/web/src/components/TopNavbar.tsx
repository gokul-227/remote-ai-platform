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
  Home,
  Users,
  MessageSquare,
  FolderKanban,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { useNotifications } from "@/hooks/useNotifications";

interface TopNavbarProps {
  onMenuClick?: () => void;
}

export function TopNavbar({ onMenuClick }: TopNavbarProps) {
  const { user, logout } = useAuth();
  const notifications = useNotifications(!!user);
  const router = useRouter();
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchVal, setSearchVal] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchVal.trim()) {
      router.push(`/jobs?query=${encodeURIComponent(searchVal.trim())}`);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      logout();
    }
    router.push("/");
  };

  const navItems =
    user?.role === "COMPANY"
      ? [
          { name: "Home", href: "/", icon: Home },
          { name: "Feed", href: "/feed", icon: MessageSquare },
          { name: "My Jobs", href: "/company/jobs", icon: Briefcase },
          { name: "Candidates", href: "/company/candidates", icon: Users },
          { name: "Network", href: "/network", icon: Users },
          { name: "Projects", href: "/projects", icon: FolderKanban },
          { name: "Messages", href: "/messages", icon: MessageSquare },
        ]
      : [
          { name: "Home", href: "/", icon: Home },
          { name: "Feed", href: "/feed", icon: MessageSquare },
          { name: "Jobs", href: "/jobs", icon: Briefcase },
          { name: "Freelancers", href: "/freelancers", icon: Users },
          ...(user?.role === "ENGINEER"
            ? [{ name: "For You", href: "/engineer/recommendations", icon: Sparkles }]
            : []),
          { name: "Network", href: "/network", icon: Users },
          { name: "Projects", href: "/projects", icon: FolderKanban },
          { name: "Messages", href: "/messages", icon: MessageSquare },
        ];

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 py-1.5 shadow-xs">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Logo + Search */}
        <div className="flex items-center gap-3 flex-1 max-w-xl">
          <button
            onClick={onMenuClick}
            className="md:hidden p-1.5 rounded-md text-slate-600 hover:bg-slate-100"
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="h-9 w-9 rounded-lg bg-[#0A66C2] flex items-center justify-center text-white font-black text-xl shadow-xs">
              W
            </div>
            <span className="hidden sm:inline font-bold text-lg text-slate-900 tracking-tight">
              Remote <span className="text-[#0A66C2]">AI Platform</span>
            </span>
          </Link>

          {/* Global Search Bar */}
          <form onSubmit={handleSearch} className="flex-1 hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                placeholder="Search jobs, skills, companies..."
                className="input-enterprise pl-9 py-1.5 text-xs bg-slate-100 focus:bg-white border-transparent focus:border-[#0A66C2]"
              />
            </div>
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
                    ? "text-[#0A66C2] border-b-2 border-[#0A66C2]"
                    : "text-slate-500 hover:text-slate-900"
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
          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
              className="p-2 rounded-full text-slate-600 hover:bg-slate-100 relative"
              title="Notifications"
            >
              <Bell className="h-5 w-5" />
              {(notifications.unread.data?.count ?? 0) > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#0A66C2]" />}
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-slate-200 p-4 z-50 animate-fade-in">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100 mb-3">
                  <h4 className="text-sm font-semibold text-slate-900">Notifications</h4>
                  <button onClick={() => notifications.markAllRead.mutate()} className="text-xs text-[#0A66C2] cursor-pointer hover:underline">Mark all read</button>
                </div>
                <div className="space-y-2.5">
                  {notifications.data?.length ? notifications.data.map((n: { id: string; title: string; body: string; is_read?: boolean }) => (
                    <button onClick={() => notifications.markRead.mutate(n.id)} key={n.id} className={`flex w-full items-start gap-2.5 p-2 rounded-lg text-left hover:bg-slate-50 cursor-pointer ${n.is_read ? "opacity-60" : ""}`}>
                      <div className="h-2 w-2 rounded-full bg-[#0A66C2] mt-1.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-slate-800 font-medium">{n.title}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{n.body}</p>
                      </div>
                    </button>
                  )) : <p className="text-xs text-slate-500">No new notifications.</p>}
                </div>
              </div>
            )}
          </div>

          {/* User profile dropdown or Sign in button */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
                className="flex items-center gap-1.5 p-1 rounded-full hover:bg-slate-100 transition-colors"
              >
                <div className="h-8 w-8 rounded-full bg-[#0A66C2] text-white flex items-center justify-center font-bold text-xs">
                  {user.full_name?.charAt(0).toUpperCase() || "U"}
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-60 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-900 truncate">{user.full_name}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  </div>
                  <div className="py-1 text-xs">
                    <Link
                      href="/engineer/profile"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-slate-700 hover:bg-slate-50"
                    >
                      <User className="h-4 w-4 text-slate-500" />
                      My Profile
                    </Link>
                    <Link
                      href="/engineer/dashboard"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-slate-700 hover:bg-slate-50"
                    >
                      <Briefcase className="h-4 w-4 text-slate-500" />
                      Career Dashboard
                    </Link>
                    <Link
                      href="/company/dashboard"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-slate-700 hover:bg-slate-50"
                    >
                      <Building2 className="h-4 w-4 text-slate-500" />
                      Hiring Dashboard
                    </Link>
                    <Link
                      href="/admin/dashboard"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-slate-700 hover:bg-slate-50"
                    >
                      <Shield className="h-4 w-4 text-slate-500" />
                      Admin Console
                    </Link>
                  </div>
                  <div className="border-t border-slate-100 pt-1">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-red-600 hover:bg-red-50"
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
