"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  LayoutDashboard,
  User,
  Building2,
  Shield,
  Sparkles,
  ChevronRight,
  Globe2,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

const navGroups = [
  {
    label: "Marketplace",
    items: [
      { name: "Find Jobs", href: "/jobs", icon: Briefcase },
      { name: "Browse Engineers", href: "/engineers", icon: Users },
      { name: "Companies", href: "/companies", icon: Globe2 },
    ],
  },
  {
    label: "My Space",
    items: [
      { name: "Dashboard", href: "/engineer/dashboard", icon: LayoutDashboard },
      { name: "My Profile", href: "/engineer/profile", icon: User },
      { name: "Company Hub", href: "/company/dashboard", icon: Building2 },
    ],
  },
  {
    label: "Admin",
    items: [
      { name: "Admin Panel", href: "/admin/dashboard", icon: Shield },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <div className="sidebar h-screen overflow-y-auto flex flex-col">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5 px-2 mb-6">
        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 flex-shrink-0">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div>
          <span className="font-bold text-sm gradient-text block leading-tight">WorkMesh AI</span>
          <span className="text-[10px] text-slate-500 font-mono block leading-tight">MARKETPLACE v1</span>
        </div>
      </Link>

      {/* Nav Groups */}
      <nav className="flex-1 space-y-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 px-2 mb-1.5">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`sidebar-item group ${isActive ? "active" : ""}`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="flex-1">{item.name}</span>
                      {isActive && <ChevronRight className="h-3 w-3 opacity-50" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User Info */}
      {user && (
        <div className="mt-4 pt-4 border-t border-white/5">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-white/[0.03] border border-white/5">
            <div className="avatar h-8 w-8 text-xs flex-shrink-0">
              {user.full_name?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">{user.full_name}</p>
              <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
