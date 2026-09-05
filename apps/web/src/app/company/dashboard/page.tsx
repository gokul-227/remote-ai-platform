"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Users, Briefcase, Sparkles, PlusCircle, FileText, Search,
  Building2, ArrowRight, ChevronRight, TrendingUp, Clock,
  CheckCircle2, AlertCircle, ArrowUpRight,
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

interface EngineerMatch {
  id: string;
  headline?: string;
  primary_role?: string;
  skills?: string[];
  user?: { full_name: string; email: string };
}

const STATUS_PIPELINE_ORDER = ["SUBMITTED", "REVIEWING", "SHORTLISTED", "INVITED", "ACCEPTED"];
const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: "bg-blue-500",
  REVIEWING: "bg-amber-500",
  SHORTLISTED: "bg-purple-500",
  INVITED: "bg-indigo-500",
  ACCEPTED: "bg-emerald-500",
  REJECTED: "bg-red-400",
};

function PipelineBar({ applications }: { applications: Array<{ application: { status: string } }> }) {
  const counts: Record<string, number> = {};
  for (const app of applications) {
    counts[app.application.status] = (counts[app.application.status] || 0) + 1;
  }
  const total = applications.length || 1;

  if (applications.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-[var(--text-muted)]">
        No applications in pipeline yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {STATUS_PIPELINE_ORDER.filter((s) => counts[s]).map((status) => {
        const count = counts[status] || 0;
        const pct = Math.round((count / total) * 100);
        return (
          <div key={status} className="flex items-center gap-3">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] w-24 shrink-0 capitalize">
              {status.charAt(0) + status.slice(1).toLowerCase()}
            </span>
            <div className="flex-1 bg-[var(--bg-subtle)] rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${STATUS_COLORS[status] || "bg-slate-400"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-bold text-[var(--text-main)] w-6 text-right">{count}</span>
          </div>
        );
      })}
    </div>
  );
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

  const recentApps = [...applications]
    .sort((a: { application?: { created_at?: string } }, b: { application?: { created_at?: string } }) =>
      new Date(b.application?.created_at || 0).getTime() - new Date(a.application?.created_at || 0).getTime()
    )
    .slice(0, 5);

  const needsAction = applications.filter((a: { application?: { status?: string } }) =>
    ["SUBMITTED", "SHORTLISTED"].includes(a.application?.status || "")
  ).length;

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
          <h2 className="text-xl font-bold text-slate-900">Set Up Your Organization Profile</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Create your organization profile to post open positions, discover AI-matched engineering talent, and manage your hiring pipeline.
          </p>
          <div className="pt-2">
            <Link href="/company/profile">
              <Button size="lg" fullWidth icon={<ArrowRight className="h-4 w-4" />}>
                Create Organization Profile
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const company = companyProfileQuery.data as { company_name?: string; logo_url?: string; industry?: string; company_size?: string } | undefined;

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 space-y-6">
      {/* Top command header — dark premium band */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B1E3D] via-[#14345C] to-[#0B1E3D] p-6 text-white">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 70% 30%, #4C9AFF 0%, transparent 60%)" }} />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#5B9DF7] border border-[#4C9AFF]/40 rounded-full px-2.5 py-0.5">Hiring Command Center</span>
              {needsAction > 0 && (
                <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 border border-amber-400/30 rounded-full px-2.5 py-0.5 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {needsAction} need review
                </span>
              )}
            </div>
            <h1 className="text-2xl font-black tracking-tight">
              {company?.company_name || "Your Organization"} — Recruiting Hub
            </h1>
            <p className="text-sm text-slate-300">
              {company?.industry && `${company.industry} · `}
              {jobs.length} open role{jobs.length !== 1 ? "s" : ""} · {applications.length} total application{applications.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/jobs/new">
              <Button size="sm" className="bg-[#0866FF] hover:bg-[#0552CC] border-transparent text-white" icon={<PlusCircle className="h-3.5 w-3.5" />}>
                Post Position
              </Button>
            </Link>
            <Link href="/company/candidates">
              <Button variant="secondary" size="sm" className="border-slate-600 text-slate-200 hover:bg-slate-700 hover:border-slate-500" icon={<Search className="h-3.5 w-3.5" />}>
                Search Talent
              </Button>
            </Link>
          </div>
        </div>

        {/* Inline metric row inside dark band */}
        <div className="relative mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Active Roles", value: jobs.length, icon: Briefcase, change: "Live now", positive: true },
            { label: "In Pipeline", value: applications.length, icon: FileText, change: needsAction > 0 ? `${needsAction} need review` : "All reviewed", positive: needsAction === 0 },
            { label: "Active Projects", value: projectsQuery.data?.length ?? 0, icon: TrendingUp, change: "Ongoing", positive: true },
            { label: "Talent Pool", value: engineers.length, icon: Users, change: "Available", positive: true },
          ].map((m) => (
            <div key={m.label} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-slate-300">{m.label}</span>
                <m.icon className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <div className="text-2xl font-black text-white">{m.value}</div>
              <div className={`text-[10px] mt-1 font-medium ${m.positive ? "text-emerald-400" : "text-amber-400"}`}>{m.change}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* LEFT: Active Jobs list */}
        <div className="lg:col-span-1 space-y-5">
          <div className="card-enterprise p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[var(--text-main)] text-sm flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-[var(--color-brand)]" />
                Open Positions
              </h2>
              <Link href="/company/jobs" className="text-xs font-semibold text-[var(--color-brand)] hover:underline">
                Manage all
              </Link>
            </div>
            <div className="space-y-2">
              {jobs.length === 0 ? (
                <div className="py-6 text-center space-y-3">
                  <p className="text-xs text-[var(--text-muted)]">No active positions posted yet.</p>
                  <Link href="/jobs/new">
                    <Button size="sm" icon={<PlusCircle className="h-3 w-3" />}>Create First Job</Button>
                  </Link>
                </div>
              ) : (
                jobs.slice(0, 6).map((job: { id: string; title: string; location?: string; is_remote?: boolean }) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-color)] hover:border-[var(--color-brand)] hover:bg-[var(--color-brand-light)]/30 transition-all group"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--text-main)] group-hover:text-[var(--color-brand)] text-xs truncate transition-colors">
                        {job.title}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${job.is_remote ? "bg-emerald-500" : "bg-amber-500"}`} />
                        {job.is_remote ? "100% Remote" : job.location || "Remote"}
                      </div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-[var(--text-light)] group-hover:text-[var(--color-brand)] shrink-0 transition-colors" />
                  </Link>
                ))
              )}
            </div>
            {jobs.length > 0 && (
              <Link href="/jobs/new">
                <Button variant="secondary" size="sm" fullWidth icon={<PlusCircle className="h-3.5 w-3.5" />}>
                  Post New Role
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* CENTER: Hiring Pipeline */}
        <div className="lg:col-span-1 space-y-5">
          <div className="card-enterprise p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[var(--text-main)] text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                Hiring Pipeline
              </h2>
              <Link href="/company/candidates" className="text-xs font-semibold text-[var(--color-brand)] hover:underline">
                Full view
              </Link>
            </div>
            <PipelineBar applications={applications} />
          </div>

          {/* Recent applications */}
          <div className="card-enterprise p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[var(--text-main)] text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                Recent Applications
              </h2>
              {needsAction > 0 && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                  {needsAction} to review
                </span>
              )}
            </div>
            <div className="space-y-2.5">
              {recentApps.length === 0 ? (
                <div className="py-4 text-center text-xs text-[var(--text-muted)]">No applicants yet.</div>
              ) : (
                recentApps.map((app: { application: { id: string; status: string; created_at?: string }; job: { title: string }; candidate: { full_name: string } }) => (
                  <div key={app.application.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[var(--border-color)] hover:border-[var(--border-hover)] transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={app.candidate.full_name} size="sm" />
                      <div className="min-w-0">
                        <span className="font-semibold text-[var(--text-main)] text-xs block truncate">{app.candidate.full_name}</span>
                        <span className="text-[10px] text-[var(--text-muted)] truncate block">{app.job.title}</span>
                      </div>
                    </div>
                    <StatusBadge label={app.application.status} tone={
                      app.application.status === "ACCEPTED" ? "success" :
                      app.application.status === "REJECTED" ? "danger" :
                      app.application.status === "REVIEWING" ? "warning" : "info"
                    } />
                  </div>
                ))
              )}
            </div>
            <Link href="/company/candidates">
              <Button variant="secondary" size="sm" fullWidth icon={<ArrowRight className="h-3.5 w-3.5" />}>
                Review All Applications
              </Button>
            </Link>
          </div>
        </div>

        {/* RIGHT: Featured talent */}
        <div className="lg:col-span-1 space-y-5">
          <div className="card-enterprise p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[var(--text-main)] text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[var(--color-ai)]" />
                Top Talent
              </h2>
              <Link href="/company/candidates" className="text-xs font-semibold text-[var(--color-brand)] hover:underline flex items-center gap-1">
                Search all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="space-y-3">
              {engineers.slice(0, 5).map((eng) => (
                <div key={eng.id} className="flex items-center gap-3 group">
                  <Avatar name={eng.user?.full_name || eng.headline || "Professional"} size="md" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[var(--text-main)] text-xs truncate">{eng.user?.full_name || "Professional"}</h3>
                    <p className="text-[10px] text-[var(--text-muted)] truncate">{eng.headline || eng.primary_role || "Remote Developer"}</p>
                    {eng.skills && eng.skills.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {eng.skills.slice(0, 2).map((s) => (
                          <span key={s} className="text-[9px] font-medium bg-[var(--bg-subtle)] border border-[var(--border-color)] text-[var(--text-muted)] rounded px-1.5 py-0.5">{s}</span>
                        ))}
                        {eng.skills.length > 2 && <span className="text-[9px] text-[var(--text-light)] self-center">+{eng.skills.length - 2}</span>}
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/engineers/${eng.id}`}
                    className="shrink-0 text-[10px] font-semibold text-[var(--color-brand)] border border-[var(--border-color)] rounded-lg px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--color-brand-light)] flex items-center gap-1"
                  >
                    View <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              ))}
            </div>

            {engineers.length === 0 && (
              <div className="text-center py-4 text-xs text-[var(--text-muted)]">
                No professionals found in directory yet.
              </div>
            )}

            <Link href="/company/candidates">
              <Button variant="secondary" size="sm" fullWidth icon={<Search className="h-3.5 w-3.5" />}>
                Search Full Talent Directory
              </Button>
            </Link>
          </div>

          {/* Quick Actions */}
          <div className="card-enterprise p-5 space-y-3">
            <h2 className="font-bold text-[var(--text-main)] text-sm">Quick Actions</h2>
            <div className="space-y-2">
              {[
                { label: "View Organization Profile", href: "/company/profile", icon: Building2, desc: "Update your brand" },
                { label: "Manage All Jobs", href: "/company/jobs", icon: Briefcase, desc: "Edit, pause, or close" },
                { label: "Candidate Pipeline", href: "/company/candidates", icon: Users, desc: "Review applications" },
                { label: "Active Projects", href: "/projects", icon: CheckCircle2, desc: "Track deliverables" },
              ].map((action) => (
                <Link key={action.href} href={action.href} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors group">
                  <action.icon className="h-4 w-4 text-[var(--color-brand)] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-main)] group-hover:text-[var(--color-brand)] transition-colors">{action.label}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{action.desc}</p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--text-light)] ml-auto shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
