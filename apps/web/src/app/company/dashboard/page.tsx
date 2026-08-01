"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Users,
  Briefcase,
  Sparkles,
  Star,
  PlusCircle,
  Bookmark,
  Search,
} from "lucide-react";
import api from "@/lib/api";
import { useJobs } from "@/hooks/useJobs";
import { useProjects } from "@/hooks/useProjects";
import { RequireRole } from "@/components/RequireRole";

interface EngineerMatch {
  id: string;
  headline?: string;
  skills?: string[];
  match_score?: number;
  user?: { full_name: string; email: string };
}

function CompanyDashboardPage() {
  const engineersQuery = useQuery<EngineerMatch[]>({ queryKey: ["engineers", { limit: 4 }], queryFn: async () => (await api.get("/engineers", { params: { limit: 4 } })).data });
  const jobsQuery = useJobs({ limit: 20 });
  const projectsQuery = useProjects();
  const engineers = engineersQuery.data || [];
  const jobs = jobsQuery.data || [];
  const loadingEngineers = engineersQuery.isLoading;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hiring Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your talent pipeline and active positions</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/jobs/new" className="btn-secondary-brand text-sm">
            <PlusCircle className="h-4 w-4" /> Post Position
          </Link>
          <Link href="/company/profile" className="btn-primary-brand text-sm">
            Company Page
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Positions", value: jobs.length, icon: Briefcase, color: "text-[#0A66C2]" },
          { label: "Candidates in Directory", value: engineers.length, icon: Users, color: "text-indigo-600" },
          { label: "Projects", value: projectsQuery.data?.length ?? 0, icon: Sparkles, color: "text-amber-600" },
          { label: "Skill Matches", value: "—", icon: Bookmark, color: "text-emerald-600" },
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
              <div className="text-center py-8 space-y-2">
                <Users className="h-8 w-8 text-slate-300 mx-auto" />
                <p className="text-sm text-slate-600 font-medium">No candidates in the talent pool yet</p>
                <p className="text-xs text-slate-500">Engineers who register will appear here as candidates.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {engineers.map((eng) => {
                  const matchScore = eng.match_score;
                  const matchClass = matchScore == null ? "pill-match-low" : matchScore >= 85 ? "pill-match-high" : "pill-match-low";
                  const name = eng.user?.full_name || "Engineer profile";
                  return (
                    <div key={eng.id} className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-[#0A66C2] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 text-sm">{name}</p>
                          <p className="text-xs text-slate-500">{eng.headline || "Software Engineer"}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {eng.skills?.slice(0, 3).map((s) => <span key={s} className="badge-ent badge-ent-neutral text-[10px]">{s}</span>)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`pill-match ${matchClass}`}>{matchScore == null ? "—" : `${matchScore}%`}</span>
                        <button className="p-1 text-slate-400 hover:text-amber-500"><Star className="h-4 w-4" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
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
