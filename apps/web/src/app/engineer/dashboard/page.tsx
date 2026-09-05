"use client";

import Link from "next/link";
import {
  Briefcase,
  Sparkles,
  CheckCircle2,
  Clock,
  ArrowRight,
  User,
  ShieldCheck,
  FileText,
  Bookmark,
  Target,
} from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { RightSidebar } from "@/components/RightSidebar";
import { JobCard } from "@/components/JobCard";
import { AIMatchPanel } from "@/components/ai/MatchScore";
import { Button } from "@/components/ui/Button";
import { JobCardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/lib/auth";
import { useEngineerProfile } from "@/hooks/useEngineerProfile";
import { useJobs } from "@/hooks/useJobs";
import { useSavedJobs } from "@/hooks/useSavedJobs";
import { useApplications } from "@/hooks/useApplications";
import { useRecommendations } from "@/hooks/useRecommendations";
import { RequireRole } from "@/components/RequireRole";
import type { JobPost } from "@/types";

function timeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function EngineerDashboard() {
  return (
    <RequireRole roles={["ENGINEER"]}>
      <EngineerDashboardContent />
    </RequireRole>
  );
}

function EngineerDashboardContent() {
  const { user } = useAuth();
  const profile = useEngineerProfile(!!user);
  const jobs = useJobs({ limit: 6 });
  const savedJobs = useSavedJobs(!!user);
  const applications = useApplications(!!user);
  const matches = useRecommendations(20);
  const recommendedJobs: JobPost[] = jobs.data || [];
  const loadingJobs = jobs.isLoading;
  const profileData = profile.data as
    | {
        headline?: string;
        bio?: string;
        primary_role?: string;
        skills?: string[];
        resume_url?: string;
        github_url?: string;
        hourly_rate?: number;
        availability?: string;
        experience?: unknown[];
      }
    | undefined;

  const completionItems = [
    { label: "Headline & bio", done: !!(profileData?.headline && profileData?.bio) },
    { label: "Primary role & skills", done: !!(profileData?.primary_role && profileData?.skills?.length) },
    { label: "Resume uploaded", done: !!profileData?.resume_url },
    { label: "Rate & availability", done: !!(profileData?.hourly_rate || profileData?.availability) },
    { label: "Work experience", done: !!profileData?.experience?.length },
  ];
  const completionPercent = Math.round(
    (completionItems.filter((s) => s.done).length / completionItems.length) * 100
  );
  const topMatch = matches.data?.[0];

  if (profile.isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="skeleton-box h-8 w-64 mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-box h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (profile.isError) {
    return (
      <div className="max-w-lg mx-auto py-16">
        <div className="card-enterprise p-8 text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-blue-50 text-[#0866FF] flex items-center justify-center mx-auto">
            <User className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Build Your Professional Identity</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Create your profile to unlock explainable AI job matching, application tracking, and verified remote opportunities.
          </p>
          <div className="pt-2">
            <Link href="/engineer/profile">
              <Button size="lg" fullWidth icon={<ArrowRight className="h-4 w-4" />}>
                Complete Profile Setup
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
      <div className="lg:col-span-6 space-y-5">
        {/* Header Banner */}
        <div className="card-enterprise p-6 bg-gradient-to-r from-white via-blue-50/20 to-white dark:from-slate-900 dark:to-slate-900 border-l-4 border-l-[#0866FF] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="badge-ent badge-ent-brand text-[10px]">Career Command Center</span>
              <span className="badge-ent badge-ent-success text-[10px]">Active</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {timeOfDayGreeting()}, {user?.full_name?.split(" ")[0] || "Professional"}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Here&apos;s what&apos;s happening with your engineering career and opportunities today.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/jobs">
              <Button variant="secondary" size="sm" icon={<Briefcase className="h-3.5 w-3.5" />}>
                Browse Roles
              </Button>
            </Link>
            <Link href="/engineer/profile">
              <Button size="sm">Edit Profile</Button>
            </Link>
          </div>
        </div>

        {/* Profile Strength & Completeness Card */}
        <div className="card-enterprise p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#0866FF]" />
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">Profile Readiness</h3>
                <p className="text-[11px] text-slate-500">Completing all sections maximizes your AI match accuracy</p>
              </div>
            </div>
            <span className="text-base font-extrabold text-[#0866FF]">{completionPercent}%</span>
          </div>

          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-[#0866FF] h-full rounded-full transition-all duration-500"
              style={{ width: `${completionPercent}%` }}
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {completionItems.map((item) => (
              <span
                key={item.label}
                className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium ${
                  item.done
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {item.done ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                {item.label}
              </span>
            ))}
          </div>
        </div>

        {/* 4-Tile Quick Metric Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "AI Matches", value: matches.data?.length ?? 0, tone: "text-[#0866FF]", icon: Sparkles },
            { label: "Active Applications", value: applications.data?.length ?? 0, tone: "text-emerald-600", icon: FileText },
            { label: "Saved Roles", value: savedJobs.data?.length ?? 0, tone: "text-amber-600", icon: Bookmark },
            { label: "Profile Score", value: `${completionPercent}%`, tone: "text-purple-600", icon: Target },
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

        {/* Top AI Match Spotlight */}
        {matches.data && matches.data.length > 0 && topMatch ? (
          <div className="card-enterprise p-5 space-y-4 border-indigo-100 dark:border-indigo-950">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-[#7F56D9] flex items-center justify-center">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-white text-sm">Top AI Career Match</h2>
                  <p className="text-[11px] text-slate-500">Highest algorithmic compatibility across all current openings</p>
                </div>
              </div>
              <Link
                href="/engineer/recommendations"
                className="text-xs font-semibold text-[#0866FF] hover:underline flex items-center gap-1"
              >
                View all ({matches.data.length}) <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <Link href={`/jobs/${topMatch.job_id}`} className="block group">
              <AIMatchPanel match={topMatch} loading={matches.isLoading} />
            </Link>
          </div>
        ) : null}

        {/* Recommended Positions Feed */}
        <div className="card-enterprise p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-[#0866FF]" />
                Recommended Engineering Positions
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Aggregated live roles aligned with your experience</p>
            </div>
            <Link href="/jobs" className="text-xs font-semibold text-[#0866FF] hover:underline flex items-center gap-1">
              Browse All Jobs <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="space-y-3">
            {loadingJobs ? (
              Array.from({ length: 4 }).map((_, i) => <JobCardSkeleton key={i} />)
            ) : recommendedJobs.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="No positions loaded yet"
                description="Explore the live job marketplace to discover remote opportunities."
                actionLabel="Explore Jobs"
                actionHref="/jobs"
              />
            ) : (
              recommendedJobs.map((job) => {
                const isSaved = !!savedJobs.data?.some((s: JobPost) => s.id === job.id);
                return (
                  <JobCard
                    key={job.id}
                    job={job}
                    saved={isSaved}
                    onToggleSave={() => (isSaved ? savedJobs.remove.mutate(job.id) : savedJobs.save.mutate(job.id))}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Right Rail */}
      <div className="lg:col-span-3 space-y-4">
        <RightSidebar />
      </div>
    </div>
  );
}
