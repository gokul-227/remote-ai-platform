"use client";

import Link from "next/link";
import {
  TrendingUp,
  Building2,
  Sparkles,
} from "lucide-react";
import { useJobs } from "@/hooks/useJobs";

export function RightSidebar() {
  const jobsQuery = useJobs({ limit: 3 });
  const jobs = jobsQuery.data || [];
  return (
    <div className="space-y-4">
      {/* Suggested Jobs */}
      <div className="card-enterprise p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-[#0A66C2]" />
            Suggested Jobs
          </h3>
          <Link href="/jobs" className="text-[11px] font-semibold text-[#0A66C2] hover:underline">
            View all
          </Link>
        </div>
        <div className="space-y-2.5 text-xs">
          {jobs.length ? jobs.map((job: { id: string; title: string; company_name: string; location?: string }) => (
            <Link
              key={job.id}
              href={`/jobs/${job.id}`}
              className="block p-2 rounded-lg bg-slate-50 border border-slate-100 hover:border-slate-300 hover:bg-slate-100/60 transition-colors group"
            >
              <div className="flex items-center justify-between font-semibold text-slate-900 group-hover:text-[#0A66C2]">
                <span className="truncate">{job.title}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">{job.company_name} · {job.location || "Remote"}</p>
            </Link>
          )) : <p className="text-xs text-slate-500">No job recommendations available.</p>}
        </div>
      </div>

      {/* Trending Skills */}
      <div className="card-enterprise p-4 space-y-3">
        <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5 border-b border-slate-100 pb-2">
          <TrendingUp className="h-4 w-4 text-emerald-600" />
          Trending Market Skills
        </div>
        <div className="text-xs text-slate-500">
          Skill trends will appear as the job index accumulates market data.
        </div>
      </div>

      {/* Recommended Companies */}
      <div className="card-enterprise p-4 space-y-3">
        <div className="font-semibold text-slate-900 text-xs flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4 text-[#0A66C2]" /> Recommended Companies</span>
          <Link href="/company/profile" className="text-[11px] text-[#0A66C2] hover:underline">Explore</Link>
        </div>
        <p className="text-xs text-slate-500">Browse verified companies through the company directory.</p>
      </div>
    </div>
  );
}
