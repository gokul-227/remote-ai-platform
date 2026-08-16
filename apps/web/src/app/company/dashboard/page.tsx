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
  Building2,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import api from "@/lib/api";
import { useCompanyJobs } from "@/hooks/useCompanyJobs";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { useProjects } from "@/hooks/useProjects";
import { useCompanyApplications } from "@/hooks/useApplications";
import { RequireRole } from "@/components/RequireRole";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { Sidebar } from "@/components/Sidebar";

interface EngineerMatch {
  id: string;
  headline?: string;
  primary_role?: string;
  skills?: string[];
  user?: { full_name: string; email: string };
}

export default function CompanyDashboard() {
  return (
    <RequireRole roles={["COMPANY", "ADMIN"]}>
      <CompanyDashboardContent />
    </RequireRole>
  );
}

function CompanyDashboardContent() {
  const companyProfileQuery = useCompanyProfile();
  const engineersQuery = useQuery<EngineerMatch[]>({
    queryKey: ["engineers", { limit: 6 }],
    queryFn: async () => (await api.get("/engineers", { params: { limit: 6 } })).data,
  });
  const jobsQuery = useCompanyJobs();
  const projectsQuery = useProjects();
  const applicationsQuery = useCompanyApplications();
  const engineers = engineersQuery.data || [];
  const jobs = jobsQuery.data || [];
  const applications = applicationsQuery.data || [];

  if (companyProfileQuery.isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="skeleton-box h-8 w-64 mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-box h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (companyProfileQuery.isError) {
    return (
      <div className="max-w-lg mx-auto py-16">
        <div className="card-enterprise p-8 text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
            <Building2 className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Set Up Your Company Profile</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Create your organization profile to post open positions, discover AI-matched engineering talent, and manage your hiring pipeline.
          </p>
          <div className="pt-2">
            <Link href="/company/profile">
              <Button size="lg" fullWidth icon={<ArrowRight className="h-4 w-4" />}>
                Create Company Profile
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 py-2">
      {/* Left Sidebar */}
      <div className="lg:col-span-3 space-y-4">
        <Sidebar />
      </div>

      {/* Main Center Column */}
      <div className="lg:col-span-9 space-y-6">
        {/* Recruiting Command Header */}
        <div className="card-enterprise p-6 bg-gradient-to-r from-white via-indigo-50/20 to-white dark:from-slate-900 dark:to-slate-900 border-l-4 border-l-indigo-600 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="badge-ent badge-ent-brand text-[10px]">Hiring Command Center</span>
              <span className="badge-ent badge-ent-success text-[10px]">Verified Organization</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Recruiting Command Center
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage your open roles, review candidates through the hiring pipeline, and coordinate projects.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/jobs/new">
              <Button size="sm" icon={<PlusCircle className="h-3.5 w-3.5" />}>
                Post Position
              </Button>
            </Link>
            <Link href="/company/candidates">
              <Button variant="secondary" size="sm" icon={<Search className="h-3.5 w-3.5" />}>
                Search Talent
              </Button>
            </Link>
          </div>
        </div>

        {/* 4-Tile High-Density Metric Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Active Roles", value: jobs.length, tone: "text-[#0A66C2]", icon: Briefcase },
            { label: "Candidates in Network", value: engineers.length, tone: "text-indigo-600", icon: Users },
            { label: "Active Projects", value: projectsQuery.data?.length ?? 0, tone: "text-amber-600", icon: Sparkles },
            { label: "Applications Received", value: applications.length, tone: "text-emerald-600", icon: FileText },
          ].map((m) => (
            <div key={m.label} className="card-enterprise p-4 space-y-1.5 hover:border-slate-300 transition-colors">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{m.label}</span>
                <m.icon className={`h-4 w-4 ${m.tone}`} />
              </div>
              <div className={`text-2xl font-black ${m.tone}`}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Two-Column Section: Active Roles & Recent Applications */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Active Job Postings */}
          <div className="card-enterprise p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-[#0A66C2]" />
                  Active Job Postings ({jobs.length})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Your currently open engineering positions</p>
              </div>
              <Link href="/company/jobs" className="text-xs font-semibold text-[#0A66C2] hover:underline">
                Manage
              </Link>
            </div>

            <div className="space-y-2.5">
              {jobs.length === 0 ? (
                <div className="py-4 text-center space-y-2">
                  <p className="text-xs text-slate-500">No active positions posted yet.</p>
                  <Link href="/jobs/new">
                    <Button size="sm" icon={<PlusCircle className="h-3 w-3" />}>
                      Create First Job
                    </Button>
                  </Link>
                </div>
              ) : (
                jobs.slice(0, 4).map((job: { id: string; title: string; location?: string; is_remote?: boolean }) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-[#0A66C2] hover:bg-blue-50/20 transition-all group"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 group-hover:text-[#0A66C2] text-xs truncate">
                        {job.title}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {job.is_remote ? "100% Remote" : job.location || "Remote"}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-[#0A66C2] shrink-0" />
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Recent Applications Received */}
          <div className="card-enterprise p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-emerald-600" />
                  Hiring Pipeline ({applications.length})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Applicants moving through review</p>
              </div>
              <Link href="/company/candidates" className="text-xs font-semibold text-[#0A66C2] hover:underline">
                View Pipeline
              </Link>
            </div>

            <div className="space-y-2.5">
              {applications.length === 0 ? (
                <div className="py-4 text-center space-y-2">
                  <p className="text-xs text-slate-500">No applicants in review right now.</p>
                  <Link href="/company/candidates">
                    <Button variant="secondary" size="sm">
                      Discover Candidates
                    </Button>
                  </Link>
                </div>
              ) : (
                applications.slice(0, 4).map((app: { application: { id: string; status: string }; job: { title: string }; candidate: { full_name: string } }) => (
                  <div
                    key={app.application.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-100 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={app.candidate.full_name} size="sm" />
                      <div>
                        <span className="font-semibold text-slate-900 block">{app.candidate.full_name}</span>
                        <span className="text-[11px] text-slate-500">{app.job.title}</span>
                      </div>
                    </div>
                    <StatusBadge label={app.application.status} tone="info" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Featured Candidates in Directory */}
        <div className="card-enterprise p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#7F56D9]" />
                Top Engineering Candidates
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Verified public talent ready for remote engineering positions</p>
            </div>
            <Link href="/company/candidates" className="text-xs font-semibold text-[#0A66C2] hover:underline flex items-center gap-1">
              Search All Talent <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {engineers.slice(0, 6).map((eng) => (
              <div key={eng.id} className="p-4 rounded-xl border border-slate-100 hover:border-[#0A66C2] transition-colors space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar name={eng.user?.full_name || eng.headline || "Engineer"} size="md" />
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 text-xs truncate">
                      {eng.user?.full_name || "Engineer"}
                    </h3>
                    <p className="text-[11px] text-slate-500 truncate">{eng.headline || eng.primary_role || "Remote Developer"}</p>
                  </div>
                </div>

                {eng.skills && eng.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {eng.skills.slice(0, 3).map((s) => (
                      <span key={s} className="badge-ent badge-ent-neutral text-[10px]">
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t border-slate-50 flex items-center justify-between">
                  <Link href={`/engineers/${eng.id}`} className="text-[11px] font-semibold text-[#0A66C2] hover:underline">
                    View Profile &rarr;
                  </Link>
                  <Link href="/company/candidates">
                    <Button size="sm" variant="ghost" className="text-[11px] h-7 px-2">
                      Invite
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
