"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Users,
  Briefcase,
  Sparkles,
  PlusCircle,
  FileText,
  Search,
} from "lucide-react";
import api from "@/lib/api";
import { useCompanyJobs } from "@/hooks/useCompanyJobs";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { useProjects } from "@/hooks/useProjects";
import { useCompanyApplications } from "@/hooks/useApplications";
import { RequireRole } from "@/components/RequireRole";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Building2 } from "lucide-react";

interface EngineerMatch {
  id: string;
  headline?: string;
  skills?: string[];
  user?: { full_name: string; email: string };
}

function CompanyDashboardPage() {
  const companyProfileQuery = useCompanyProfile();
  const engineersQuery = useQuery<EngineerMatch[]>({ queryKey: ["engineers", { limit: 4 }], queryFn: async () => (await api.get("/engineers", { params: { limit: 4 } })).data });
  const jobsQuery = useCompanyJobs();
  const projectsQuery = useProjects();
  const applicationsQuery = useCompanyApplications();
  const engineers = engineersQuery.data || [];
  const jobs = jobsQuery.data || [];
  const loadingEngineers = engineersQuery.isLoading;

  // A COMPANY-role account with no completed company profile yet (reachable
  // via the workspace switcher without ever visiting /company/profile first)
  // previously fell through to this whole dashboard anyway, showing global
  // platform-wide job/engineer counts mislabeled as "your" positions and
  // candidates. Gate on the profile actually existing instead.
  if (companyProfileQuery.isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="skeleton-box h-8 w-64 mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton-box h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (companyProfileQuery.isError) {
    return (
      <div className="max-w-lg mx-auto py-16">
        <div className="card-enterprise">
          <EmptyState
            icon={Building2}
            title="Set up your company profile to get started"
            description="Add your company name, industry, and description so candidates and the hiring dashboard have something real to show."
            actionLabel="Create Company Profile"
            actionHref="/company/profile"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hiring Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your talent pipeline and active positions</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/jobs/new"><Button variant="secondary" icon={<PlusCircle className="h-4 w-4" />}>Post Position</Button></Link>
          <Link href="/company/profile"><Button>Company Page</Button></Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Positions", value: jobs.length, icon: Briefcase, color: "text-[#0A66C2]" },
          { label: "Candidates in Directory", value: engineers.length, icon: Users, color: "text-indigo-600" },
          { label: "Projects", value: projectsQuery.data?.length ?? 0, icon: Sparkles, color: "text-amber-600" },
          { label: "Applications Received", value: applicationsQuery.data?.length ?? 0, icon: FileText, color: "text-emerald-600" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card-enterprise p-5 space-y-2">
              <div className={`${stat.color}`}><Icon className="h-5 w-5" /></div>
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-slate-500 font-medium">{stat.label}</div>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Pipeline + Activity */}
        <div className="lg:col-span-2 space-y-5">
          {/* Hiring Pipeline */}
          <div className="card-enterprise p-6 space-y-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-slate-400" /> Hiring Pipeline
            </h2>
            <p className="text-sm text-slate-500">Pipeline activity will appear after candidates apply to your positions.</p>
          </div>

          {/* Recommended Talent */}
          <div className="card-enterprise p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#0A66C2]" /> Recommended Talent
              </h2>
              <button className="text-xs font-semibold text-[#0A66C2] hover:underline flex items-center gap-1">
                <Search className="h-3.5 w-3.5" /> Search Talent
              </button>
            </div>

            {loadingEngineers ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-lg bg-slate-50 animate-pulse">
                    <div className="skeleton-box h-10 w-10 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="skeleton-box h-4 w-1/2" />
                      <div className="skeleton-box h-3 w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : engineers.length === 0 ? (
              <EmptyState icon={Users} title="No candidates in the talent pool yet" description="Engineers who register will appear here as candidates." />
            ) : (
              <>
              <div className="space-y-3">
                {engineers.map((eng) => {
                  const name = eng.user?.full_name || "Engineer profile";
                  return (
                    <Link key={eng.id} href={`/engineers/${eng.id}`} className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <Avatar name={name} />
                        <div>
                          <p className="font-semibold text-slate-900 text-sm">{name}</p>
                          <p className="text-xs text-slate-500">{eng.headline || "Software Engineer"}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {eng.skills?.slice(0, 3).map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-[#0A66C2] flex-shrink-0">View profile</span>
                    </Link>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400">
                For AI-ranked match scores against a specific role, use{" "}
                <Link href="/company/candidates" className="text-[#0A66C2] hover:underline">Candidate Discovery</Link>.
              </p>
              </>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-5">
          {/* Active Positions */}
          <div className="card-enterprise p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-semibold text-slate-900 text-sm">Active Positions</h3>
              <Link href="/jobs/new" className="text-xs text-[#0A66C2] hover:underline">+ Post</Link>
            </div>
            <div className="space-y-2 text-xs">
              {jobs.length ? jobs.slice(0, 3).map((role: { id: string; title: string; company_name: string }) => (
                <Link key={role.id} href={`/jobs/${role.id}`} className="block rounded-lg border border-slate-100 bg-slate-50 p-2.5 hover:border-slate-300">
                  <p className="font-semibold text-slate-800 leading-snug">{role.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{role.company_name}</p>
                </Link>
              )) : <p className="text-slate-500">No active positions.</p>}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card-enterprise p-5 space-y-3">
            <h3 className="font-semibold text-slate-900 text-sm border-b border-slate-100 pb-2">Recent Activity</h3>
            <div className="space-y-2.5 text-xs">
              <p className="text-slate-500">No recent activity.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CompanyDashboard() {
  return (
    <RequireRole roles={["COMPANY", "ADMIN"]}>
      <CompanyDashboardPage />
    </RequireRole>
  );
}
