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

const TRENDING_SKILLS = [
  { name: "TypeScript", growth: "+24%" },
  { name: "Python / FastAPI", growth: "+38%" },
  { name: "React / Next.js", growth: "+19%" },
  { name: "Rust", growth: "+42%" },
  { name: "PyTorch / LLMs", growth: "+65%" },
];

export function RightSidebar() {
  const jobsQuery = useJobs({ limit: 4 });
  const jobs: JobPost[] = jobsQuery.data || [];

  return (
    <div className="space-y-4">
      {/* Suggested Jobs */}
      <div className="card-enterprise p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-[#0A66C2]" />
            AI Matched Roles
          </h3>
          <Link href="/jobs" className="text-[11px] font-semibold text-[#0A66C2] hover:underline">
            View all
          </Link>
        </div>
        <div className="space-y-2 text-xs">
          {jobs.length ? (
            jobs.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="block p-2.5 rounded-lg bg-slate-50 border border-slate-100 hover:border-[#0A66C2] hover:bg-blue-50/30 transition-all group"
              >
                <div className="flex items-center justify-between font-semibold text-slate-900 group-hover:text-[#0A66C2]">
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

      {/* Trending Market Skills */}
      <div className="card-enterprise p-4 space-y-3">
        <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5 border-b border-slate-100 pb-2">
          <TrendingUp className="h-4 w-4 text-emerald-600" />
          High-Demand Skills
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TRENDING_SKILLS.map((skill) => (
            <Link
              key={skill.name}
              href={`/jobs?query=${encodeURIComponent(skill.name)}`}
              className="badge-ent badge-ent-neutral hover:border-[#0A66C2] hover:text-[#0A66C2] transition-colors text-[11px] py-1 px-2 flex items-center gap-1"
            >
              <span>{skill.name}</span>
              <span className="text-emerald-600 font-bold text-[10px]">{skill.growth}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Verified Companies */}
      <div className="card-enterprise p-4 space-y-3">
        <div className="font-semibold text-slate-900 text-xs flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-[#0A66C2]" /> Verified Employers
          </span>
          <Link href="/companies" className="text-[11px] text-[#0A66C2] font-semibold hover:underline">
            Browse
          </Link>
        </div>
        <div className="text-xs text-slate-600 space-y-2">
          <p className="text-[11px] text-slate-500">
            Connect directly with verified remote-first engineering teams and start-ups.
          </p>
          <Link
            href="/companies"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0A66C2] hover:gap-1.5 transition-all"
          >
            Explore Directory <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
