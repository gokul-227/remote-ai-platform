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
  Users,
  BrainCircuit,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useSavedJobs } from "@/hooks/useSavedJobs";
import { useApplications } from "@/hooks/useApplications";

type NavItem = { name: string; href: string; icon: typeof User; count?: number };

// Role-scoped, profile-centric links. Routes already reachable from the
// global top nav (Jobs, Professionals, Network, Messages, Communities,
// Contracts, Projects) are deliberately not repeated here — this rail is
// "your identity and work," not a second copy of primary navigation.
function useNavItems(): NavItem[] {
  const { user } = useAuth();
  const savedJobs = useSavedJobs(user?.role === "ENGINEER");
  const applications = useApplications(user?.role === "ENGINEER");

  if (user?.role === "COMPANY") {
    return [
      { name: "Organization Profile", href: "/company/profile", icon: Building2 },
      { name: "Hiring Dashboard", href: "/company/dashboard", icon: LayoutDashboard },
      { name: "My Job Postings", href: "/company/jobs", icon: Briefcase },
      { name: "Candidate Discovery", href: "/company/candidates", icon: Users },
      { name: "Wallet & Payments", href: "/payments", icon: Wallet },
      { name: "AI Quality Engine", href: "/quality", icon: BrainCircuit },
    ];
  }

  if (user?.role === "ADMIN") {
    return [
      { name: "Admin Console", href: "/admin/dashboard", icon: Shield },
      { name: "User Management", href: "/admin/users", icon: Users },
      { name: "Job Listings", href: "/admin/jobs", icon: Briefcase },
      { name: "AI Quality Engine", href: "/quality", icon: BrainCircuit },
    ];
  }

  // ENGINEER (default for logged-out visitors previewing the shell)
  return [
    { name: "My Profile", href: "/engineer/profile", icon: User },
    { name: "Career Dashboard", href: "/engineer/dashboard", icon: LayoutDashboard },
    { name: "Recommendations", href: "/engineer/recommendations", icon: LayoutDashboard },
    { name: "Saved Jobs", href: "/jobs?saved=true", icon: Bookmark, count: savedJobs.data?.length },
    { name: "My Applications", href: "/engineer/applications", icon: FileText, count: applications.data?.length },
    { name: "Execution Workspace", href: "/engineer/workspace", icon: FolderKanban },
    { name: "Wallet & Payments", href: "/payments", icon: Wallet },
    { name: "AI Quality Engine", href: "/quality", icon: BrainCircuit },
  ];
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const applications = useApplications(!!user && user.role === "ENGINEER");
  const navItems = useNavItems();
  const sectionLabel = user?.role === "COMPANY" ? "Hiring" : user?.role === "ADMIN" ? "Administration" : "Career Navigation";

  if (!user) {
    return (
      <div className="w-full">
        <div className="card-enterprise p-5 text-center space-y-2.5">
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Unlock your career dashboard</h3>
          <p className="text-xs text-slate-500">Sign in to track applications, save jobs, and see AI-matched roles.</p>
          <Link href="/auth/login" className="btn-primary-brand w-full block text-center text-xs mt-2">
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Profile Card Widget */}
      <div className="card-enterprise overflow-hidden text-center">
        <div className="h-14 bg-slate-200" />
        <div className="px-4 pb-4 -mt-7">
          <div className="h-14 w-14 rounded-full bg-[#0552CC] text-white flex items-center justify-center font-bold text-lg ring-4 ring-white mx-auto shadow-xs">
            {user.full_name?.charAt(0).toUpperCase() || "U"}
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm mt-2 truncate">
            {user.full_name}
          </h3>
          <p className="text-xs text-slate-500 truncate mt-0.5">
            {user.email}
          </p>

          {user.role === "ENGINEER" && (
            <div className="border-t border-slate-100 dark:border-slate-800 mt-3 pt-3 text-left text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Applications</span>
                <span className="font-semibold text-[#0552CC]">{applications.data?.length ?? 0}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Card */}
      <div className="card-enterprise p-2">
        <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {sectionLabel}
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
                    ? "bg-slate-100 dark:bg-slate-800 text-[#0552CC] font-semibold"
                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`h-4 w-4 ${isActive ? "text-[#0552CC]" : "text-slate-400"}`} />
                  <span>{item.name}</span>
                </div>
                {item.count !== undefined && (
                  <span className="text-[10px] font-bold text-[#0552CC] bg-sky-50 px-1.5 py-0.5 rounded-full border border-sky-100">
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
