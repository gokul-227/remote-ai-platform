"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Search,
  Bell,
  Menu,
  X,
  Sparkles,
  ChevronDown,
  User,
  Settings,
  LogOut,
  Briefcase,
  LayoutDashboard,
  Building2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

interface TopNavbarProps {
  onMenuClick?: () => void;
}

export function TopNavbar({ onMenuClick }: TopNavbarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchVal, setSearchVal] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchVal.trim()) router.push(`/jobs?query=${encodeURIComponent(searchVal.trim())}`);
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-30 glass border-b border-white/[0.06] px-4 py-2.5 flex items-center gap-3">
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuClick}
        className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
        aria-label="Menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile logo */}
      <Link href="/" className="md:hidden flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="font-bold text-sm gradient-text">WorkMesh AI</span>
      </Link>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-lg items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            placeholder="Search jobs, engineers, skills..."
            className="input-field pl-9 py-2 text-sm"
          />
        </div>
        <button type="submit" className="btn-primary py-2 px-4 text-sm">
          Search
        </button>
      </form>

      <div className="flex-1 md:hidden" />

      {/* Right actions */}
      <div className="flex items-center gap-1">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
            className="btn-ghost relative"
          >
            <Bell className="h-4.5 w-4.5" />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-cyan-500 ring-2 ring-[#0b0f19]" />
          </button>
          {notifOpen && (
            <div className="absolute right-0 mt-2 w-72 glass rounded-xl p-3 border border-white/10 shadow-xl">
              <p className="text-xs font-semibold text-slate-300 mb-2">Notifications</p>
              <div className="space-y-2">
                {[
                  { text: "New job match: Senior React Engineer at Stripe", time: "2m ago" },
                  { text: "Your profile was viewed by 3 companies", time: "1h ago" },
                  { text: "AI suggestions updated for your profile", time: "3h ago" },
                ].map((n, i) => (
                  <div key={i} className="flex gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer">
                    <div className="h-1.5 w-1.5 rounded-full bg-cyan-500 mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-200">{n.text}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{n.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile menu */}
        {user ? (
          <div className="relative">
            <button
              onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/5 transition-colors"
            >
              <div className="avatar h-7 w-7 text-xs">
                {user.full_name?.charAt(0).toUpperCase() || "U"}
              </div>
              <span className="hidden md:block text-sm text-slate-300 font-medium max-w-[100px] truncate">
                {user.full_name?.split(" ")[0]}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-56 glass rounded-xl overflow-hidden border border-white/10 shadow-xl">
                <div className="px-3 py-2.5 border-b border-white/5">
                  <p className="text-sm font-semibold text-slate-200">{user.full_name}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                </div>
                <div className="py-1">
                  {[
                    { label: "My Profile", href: "/engineer/profile", icon: User },
                    { label: "Dashboard", href: "/engineer/dashboard", icon: LayoutDashboard },
                    { label: "Company Hub", href: "/company/dashboard", icon: Building2 },
                    { label: "Settings", href: "/settings", icon: Settings },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <Icon className="h-3.5 w-3.5 text-slate-500" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
                <div className="border-t border-white/5 py-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link href="/auth/login" className="btn-ghost text-sm">
              Sign in
            </Link>
            <Link href="/auth/register" className="btn-primary py-2 px-4 text-sm">
              Get started
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
