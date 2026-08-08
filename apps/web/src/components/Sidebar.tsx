"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bookmark,
  Briefcase,
  FileText,
  User,
  LayoutDashboard,
  Building2,
  Shield,
  FolderKanban,
  Settings,
  Users,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useSavedJobs } from "@/hooks/useSavedJobs";
import { useApplications } from "@/hooks/useApplications";

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const savedJobs = useSavedJobs(!!user);
  const applications = useApplications(!!user);

  const navItems = [
    { name: "My Profile", href: "/engineer/profile", icon: User },
    { name: "Saved Jobs", href: "/jobs?saved=true", icon: Bookmark, count: savedJobs.data?.length },
    { name: "My Applications", href: "/engineer/applications", icon: FileText, count: applications.data?.length },
    { name: "Recommendations", href: "/engineer/recommendations", icon: LayoutDashboard },
    { name: "Browse Engineers", href: "/engineers", icon: Users },
    { name: "Browse Companies", href: "/companies", icon: Building2 },
    { name: "Freelancer Directory", href: "/freelancers", icon: Briefcase },
    { name: "Network", href: "/network", icon: Users },
    { name: "Messages", href: "/messages", icon: MessageSquare },
    { name: "Career Dashboard", href: "/engineer/dashboard", icon: LayoutDashboard },
    { name: "Hiring Dashboard", href: "/company/dashboard", icon: Building2 },
    { name: "Admin Console", href: "/admin/dashboard", icon: Shield },
    { name: "Projects", href: "/projects", icon: FolderKanban },
    { name: "Settings", href: "#", icon: Settings },
  ];

  return (
    <div className="w-full space-y-4">
      {/* Profile Card Widget */}
      <div className="card-enterprise overflow-hidden text-center">
        <div className="h-14 bg-slate-200" />
        <div className="px-4 pb-4 -mt-7">
          <div className="h-14 w-14 rounded-full bg-[#0A66C2] text-white flex items-center justify-center font-bold text-lg ring-4 ring-white mx-auto shadow-xs">
            {user?.full_name?.charAt(0).toUpperCase() || "U"}
          </div>
          <h3 className="font-semibold text-slate-900 text-sm mt-2 truncate">
            {user?.full_name || "Engineering Professional"}
          </h3>
          <p className="text-xs text-slate-500 truncate mt-0.5">
            {user?.email || "Software Developer"}
          </p>

          <div className="border-t border-slate-100 mt-3 pt-3 text-left text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Applications</span>
              <span className="font-semibold text-[#0A66C2]">{applications.data?.length ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Card */}
      <div className="card-enterprise p-2">
        <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Career Navigation
        </div>
        <nav className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-slate-100 text-[#0A66C2] font-semibold"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`h-4 w-4 ${isActive ? "text-[#0A66C2]" : "text-slate-400"}`} />
                  <span>{item.name}</span>
                </div>
                {item.count !== undefined && (
                  <span className="text-[10px] font-bold text-[#0A66C2] bg-sky-50 px-1.5 py-0.5 rounded-full border border-sky-100">
                    {item.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
