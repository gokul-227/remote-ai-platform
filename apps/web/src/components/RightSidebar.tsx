"use client";

import Link from "next/link";
import {
  TrendingUp,
  Building2,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { useJobs } from "@/hooks/useJobs";
import type { JobPost } from "@/types";

export function RightSidebar() {
  const jobsQuery = useJobs({ limit: 4 });
  const jobs: JobPost[] = jobsQuery.data || [];

  return (
    <div className="space-y-4">
      {/* Suggested Jobs */}
      <div className="card-enterprise p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <h3 className="font-semibold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-[#0552CC]" />
            AI Matched Roles
          </h3>
          <Link href="/jobs" className="text-[11px] font-semibold text-[#0552CC] hover:underline">
            View all
          </Link>
        </div>
        <div className="space-y-2 text-xs">
          {jobs.length ? (
            jobs.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="block p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 hover:border-[#0552CC] hover:bg-blue-50/30 transition-all group"
              >
                <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-white group-hover:text-[#0552CC]">
                  <span className="truncate">{job.title}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                  <span className="truncate">{job.company_name}</span>
                  <span className="text-emerald-700 font-medium">{job.location || "Remote"}</span>
                </div>
              </Link>
            ))
          ) : (
            <p className="text-xs text-slate-500 py-1">Exploring new recommendations...</p>
          )}
        </div>
      </div>

      {/* High-Demand Skills: not a live feature yet -- the backend task that
          would compute this (refresh_trending_skills) is still a stub with
          no real logic behind it, gated off by FEATURE_TRENDING_SKILLS. This
          previously rendered a hardcoded, always-the-same skills list as if
          it were live market data; showing an honest "coming soon" state
          instead of fabricated growth numbers. */}
      <div className="card-enterprise p-4 space-y-2">
        <div className="font-semibold text-slate-900 dark:text-white text-xs flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
          <TrendingUp className="h-4 w-4 text-emerald-600" />
          High-Demand Skills
        </div>
        <p className="text-[11px] text-slate-500">Coming soon — we&apos;re still building this.</p>
      </div>

      {/* Verified Companies */}
      <div className="card-enterprise p-4 space-y-3">
        <div className="font-semibold text-slate-900 dark:text-white text-xs flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <span className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-[#0552CC]" /> Verified Employers
          </span>
          <Link href="/companies" className="text-[11px] text-[#0552CC] font-semibold hover:underline">
            Browse
          </Link>
        </div>
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-2">
          <p className="text-[11px] text-slate-500">
            Connect directly with verified remote-first engineering teams and start-ups.
          </p>
          <Link
            href="/companies"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0552CC] hover:gap-1.5 transition-all"
          >
            Explore Directory <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
