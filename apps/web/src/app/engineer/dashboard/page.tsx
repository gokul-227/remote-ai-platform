"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Briefcase,
  Sparkles,
  CheckCircle2,
  Clock,
} from "lucide-react";
import api from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { RightSidebar } from "@/components/RightSidebar";
import { useAuth } from "@/lib/auth";
import { useEngineerProfile } from "@/hooks/useEngineerProfile";
import { useJobs } from "@/hooks/useJobs";
import { useSavedJobs } from "@/hooks/useSavedJobs";
import { useApplications } from "@/hooks/useApplications";

interface JobPost {
  id: string;
  title: string;
  company_name: string;
  salary_min?: number;
  salary_max?: number;
  skills: string[];
}

export default function EngineerDashboard() {
  const { user } = useAuth();
  const profile = useEngineerProfile(!!user);
  const jobs = useJobs({ limit: 5 });
  const savedJobs = useSavedJobs(!!user);
  const applications = useApplications(!!user);
  const matches = useQuery({ queryKey: ["recommendations", user?.id], queryFn: async () => (await api.get("/matching/recommendations", { params: { limit: 20 } })).data, enabled: !!user });
  const recommendedJobs: JobPost[] = jobs.data || [];
  const loadingJobs = jobs.isLoading;
  const profileData = profile.data as { headline?: string; bio?: string; primary_role?: string; skills?: string[]; resume_url?: string; github_url?: string; experience?: unknown[] } | undefined;
  const completionItems = [
    { label: "Headline & bio", done: !!(profileData?.headline && profileData?.bio) },
    { label: "Primary role & skills", done: !!(profileData?.primary_role && profileData?.skills?.length) },
    { label: "Resume uploaded", done: !!profileData?.resume_url },
    { label: "GitHub profile linked", done: !!profileData?.github_url },
    { label: "Work experience added", done: !!profileData?.experience?.length },
  ];
  const completionPercent = Math.round((completionItems.filter((s) => s.done).length / completionItems.length) * 100);
  const matchScore = matches.data?.[0]?.overall_score;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Left Sidebar */}
      <div className="lg:col-span-3 space-y-4">
        <Sidebar />
      </div>

      {/* Center Feed */}
      <div className="lg:col-span-6 space-y-4">
        {/* Welcome Header */}
        <div className="card-enterprise p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Welcome back, {user?.full_name?.split(" ")[0] || "Engineer"} 👋
            </h1>
            <p className="text-xs text-slate-500 mt-1">Your career activity and job recommendations today.</p>
          </div>
          <Link href="/engineer/profile" className="btn-primary-brand text-xs">
            My Profile
          </Link>
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Match Rating", value: matchScore == null ? "—" : `${matchScore}/100`, color: "text-[#0A66C2]" },
            { label: "Matched Roles", value: matches.data?.length ?? 0, color: "text-slate-900" },
            { label: "Applications", value: applications.data?.length ?? 0, color: "text-emerald-700" },
            { label: "Saved Jobs", value: savedJobs.data?.length ?? 0, color: "text-amber-700" },
          ].map((s) => (
            <div key={s.label} className="card-enterprise p-4 text-center">
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[11px] text-slate-500 font-medium mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Recommended Jobs */}
        <div className="card-enterprise p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#0A66C2]" />
                Recommended Positions
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Top opportunities matching your skills</p>
            </div>
            <Link href="/jobs" className="text-xs font-semibold text-[#0A66C2] hover:underline">
              View all
            </Link>
          </div>

          <div className="space-y-2.5">
            {loadingJobs ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-lg bg-slate-50 animate-pulse">
                  <div className="skeleton-box h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton-box h-4 w-2/3" />
                    <div className="skeleton-box h-3 w-1/3" />
                  </div>
                </div>
              ))
            ) : recommendedJobs.length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <Briefcase className="h-8 w-8 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-500">No positions loaded yet.</p>
                <Link href="/jobs" className="btn-primary-brand py-1.5 px-4 text-xs inline-flex">
                  Browse Jobs
                </Link>
              </div>
            ) : (
              recommendedJobs.map((job) => {
                return (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="flex items-start justify-between gap-3 p-3 rounded-lg border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-colors group"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 flex-shrink-0 text-xs">
                        {job.company_name?.charAt(0).toUpperCase() || "C"}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900 text-xs group-hover:text-[#0A66C2] truncate">
                          {job.title}
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">{job.company_name}</p>
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {job.skills?.slice(0, 3).map((s) => (
                            <span key={s} className="badge-ent badge-ent-neutral text-[10px]">{s}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <span className="pill-match pill-match-high text-[10px] flex-shrink-0">
                      —
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card-enterprise p-5 space-y-3">
          <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-2">
            <Clock className="h-4 w-4 text-slate-400" /> Recent Activity
          </h2>
          <div className="space-y-3 text-xs">
            <p className="text-xs text-slate-500">Activity will appear as you save jobs and submit applications.</p>
          </div>
        </div>
      </div>

      {/* Right Column */}
      <div className="lg:col-span-3 space-y-4">
        {/* Profile Completion */}
        <div className="card-enterprise p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 text-sm">Profile Progress</h3>
            <span className="font-bold text-[#0A66C2] text-xs">{completionPercent}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div className="bg-[#0A66C2] h-full rounded-full transition-all" style={{ width: `${completionPercent}%` }} />
          </div>
          <div className="space-y-1.5 pt-1">
            {completionItems.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-xs">
                {item.done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-slate-300 flex-shrink-0" />
                )}
                <span className={item.done ? "text-slate-600" : "text-slate-400"}>{item.label}</span>
              </div>
            ))}
          </div>
          <Link href="/engineer/profile" className="btn-secondary-brand text-xs w-full block text-center mt-2">
            Complete Profile
          </Link>
        </div>

        <RightSidebar />
      </div>
    </div>
  );
}
