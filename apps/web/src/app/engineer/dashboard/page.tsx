"use client";

import Link from "next/link";
import { Briefcase, Sparkles, CheckCircle2, Clock, ArrowRight, User } from "lucide-react";
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
  const jobs = useJobs({ limit: 5 });
  const savedJobs = useSavedJobs(!!user);
  const applications = useApplications(!!user);
  const matches = useRecommendations(20);
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
  const topMatch = matches.data?.[0];

  // Still loading the profile — show a minimal skeleton so the page doesn't
  // flash content that depends on profileData being present.
  if (profile.isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="skeleton-box h-8 w-64 mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton-box h-20 rounded-xl" />)}
        </div>
      </div>
    );
  }

  // No engineer profile exists yet (GET /engineers/me → 404). This is
  // reachable via the workspace switcher — an account that signed up as COMPANY
  // and switched to Personal Workspace before creating an engineer profile.
  if (profile.isError) {
    return (
      <div className="max-w-lg mx-auto py-16">
        <div className="card-enterprise">
          <EmptyState
            icon={User}
            title="Set up your engineer profile to get started"
            description="Add your headline, skills, and experience so you can receive AI-powered job matches and apply to remote engineering roles."
            actionLabel="Create Engineer Profile"
            actionHref="/engineer/profile"
          />
        </div>
      </div>
    );
  }

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
              {timeOfDayGreeting()}, {user?.full_name?.split(" ")[0] || "Engineer"}
            </h1>
            <p className="text-xs text-slate-500 mt-1">Here&rsquo;s what&rsquo;s happening with your career.</p>
          </div>
          <Link href="/engineer/profile">
            <Button size="sm">My Profile</Button>
          </Link>
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Profile Strength", value: `${completionPercent}%`, color: "text-[#0A66C2]" },
            { label: "AI Matches", value: matches.data?.length ?? 0, color: "text-slate-900" },
            { label: "Applications", value: applications.data?.length ?? 0, color: "text-emerald-700" },
            { label: "Saved Jobs", value: savedJobs.data?.length ?? 0, color: "text-amber-700" },
          ].map((s) => (
            <div key={s.label} className="card-enterprise p-4 text-center">
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[11px] text-slate-500 font-medium mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Top AI Match Hero */}
        {matches.data && matches.data.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-slate-900 text-sm">Your AI career match</h2>
              <Link href="/engineer/matches" className="text-xs font-semibold text-[#0A66C2] hover:underline flex items-center gap-1">
                View all matches <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <Link href={`/jobs/${topMatch?.job_id}`} className="block">
              <AIMatchPanel match={topMatch ?? null} loading={matches.isLoading} />
            </Link>
            {topMatch?.job && (
              <p className="text-xs text-slate-500 mt-2 px-1">
                Top match: <span className="font-semibold text-slate-700">{topMatch.job.title}</span> at {topMatch.job.company_name}
              </p>
            )}
          </div>
        ) : !matches.isLoading ? (
          <div className="card-enterprise">
            <EmptyState
              icon={Sparkles}
              title="No AI matches yet"
              description="Complete your engineer profile so we can compute explainable matches against open roles."
              actionLabel="Complete your profile"
              actionHref="/engineer/profile"
            />
          </div>
        ) : null}

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
              Array.from({ length: 3 }).map((_, i) => <JobCardSkeleton key={i} />)
            ) : recommendedJobs.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="No positions loaded yet"
                description="Browse the marketplace to discover open remote engineering roles."
                actionLabel="Browse Jobs"
                actionHref="/jobs"
              />
            ) : (
              recommendedJobs.map((job) => <JobCard key={job.id} job={job} compact />)
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
          <Link href="/engineer/profile">
            <Button variant="secondary" size="sm" fullWidth className="mt-2">Complete Profile</Button>
          </Link>
        </div>

        <RightSidebar />
      </div>
    </div>
  );
}
