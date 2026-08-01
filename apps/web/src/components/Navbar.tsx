"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, Briefcase, User, Building2, Shield, Search } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Explore Jobs", href: "/jobs", icon: Briefcase },
    { name: "Engineer Hub", href: "/engineer/dashboard", icon: User },
    { name: "Company Portal", href: "/company/dashboard", icon: Building2 },
    { name: "Admin Stats", href: "/admin/dashboard", icon: Shield },
  ];

  return (
    <nav className="sticky top-0 z-50 glass-panel border-b border-gray-800/80 px-4 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg tracking-tight gradient-text">WorkMesh AI</span>
            <span className="text-[10px] text-cyan-400/80 -mt-1 font-mono">MARKETPLACE v1.0</span>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-1 bg-gray-900/60 p-1.5 rounded-xl border border-gray-800">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-cyan-300 border border-cyan-500/30"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-cyan-400" : "text-gray-400"}`} />
                {item.name}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/jobs"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-sm font-medium transition-all"
          >
            <Search className="h-4 w-4" />
            Find Jobs
          </Link>
        </div>
      </div>
    </nav>
  );
}
