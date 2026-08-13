"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Briefcase, Users, MessageSquare, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

export function MobileBottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (!user) return null;

  const homeHref = user.role === "COMPANY" ? "/company/dashboard" : user.role === "ADMIN" ? "/admin/dashboard" : "/engineer/dashboard";
  const jobsItem = user.role === "COMPANY" ? { name: "Jobs", href: "/company/jobs", icon: Briefcase } : { name: "Jobs", href: "/jobs", icon: Briefcase };

  const items = [
    { name: "Home", href: homeHref, icon: LayoutDashboard },
    { name: "Feed", href: "/feed", icon: Home },
    jobsItem,
    { name: "Network", href: "/network", icon: Users },
    { name: "Messages", href: "/messages", icon: MessageSquare },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[var(--border-color)] flex items-stretch pb-[env(safe-area-inset-bottom)]">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-[10px] font-medium",
              isActive ? "text-[var(--color-brand)]" : "text-[var(--text-light)]"
            )}
          >
            <Icon className="h-5 w-5" />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
