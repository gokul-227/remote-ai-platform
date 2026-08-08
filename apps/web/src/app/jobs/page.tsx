"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Search,
  MapPin,
  DollarSign,
  Briefcase,
  RefreshCw,
  Bookmark,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { RightSidebar } from "@/components/RightSidebar";
import { useJobs } from "@/hooks/useJobs";
import { useSavedJobs } from "@/hooks/useSavedJobs";

interface JobPost {
  id: string;
  title: string;
  company_name: string;
  company_logo?: string;
  location?: string;
  is_remote: boolean;
  job_type: string;
  experience_level?: string;
  salary_min?: number;
  salary_max?: number;
  currency: string;
  skills: string[];
  source: string;
  external_url?: string;
  posted_at: string;
}

const SKILLS_OPTIONS = [
  "React", "TypeScript", "Python", "Node.js", "Go", "Rust",
  "AWS", "Kubernetes", "Docker", "PostgreSQL", "FastAPI", "GraphQL",
];

function JobSkeleton() {
  return (
    <div className="card-enterprise p-4 space-y-3">
      <div className="flex gap-3">
        <div className="skeleton-box h-12 w-12 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="skeleton-box h-4 w-3/4" />
          <div className="skeleton-box h-3 w-1/2" />
          <div className="skeleton-box h-3 w-1/3" />
        </div>
      </div>
      <div className="flex gap-2 pt-1 border-t border-slate-100">
        <div className="skeleton-box h-5 w-16" />
        <div className="skeleton-box h-5 w-20" />
        <div className="skeleton-box h-5 w-14" />
      </div>
    </div>
  );
}

function JobsContent() {
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("query") || "");
  const [jobType, setJobType] = useState("");
  const [experience, setExperience] = useState("");
  const [minSalary, setMinSalary] = useState("");
  const [maxSalary, setMaxSalary] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [page, setPage] = useState(0);

  const limit = 10;

  const jobsQuery = useJobs({ limit, skip: page * limit, query: searchQuery || undefined, job_type: jobType || undefined, experience_level: experience || undefined, min_salary: minSalary || undefined, max_salary: maxSalary || undefined, skills: selectedSkills.length ? selectedSkills : undefined });
  const savedJobs = useSavedJobs(true);
  const jobs: JobPost[] = jobsQuery.data || [];
  const loading = jobsQuery.isLoading;
  const error = jobsQuery.error ? "Unable to load jobs. Please retry." : null;

  const savedJobIds = new Set((savedJobs.data || []).map((job: JobPost) => job.id));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Left Sidebar */}
      <div className="lg:col-span-3 space-y-4">
        <Sidebar />

        {/* Filter Panel */}
        <div className="card-enterprise p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="font-semibold text-slate-900 text-xs">Filter Jobs</h3>
            <button
              onClick={() => { setSearchQuery(""); setJobType(""); setExperience(""); setMinSalary(""); setMaxSalary(""); setSelectedSkills([]); setPage(0); }}
              className="text-xs text-[#0A66C2] hover:underline"
            >
              Reset
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Job Type</label>
              <select
                value={jobType}
                onChange={(e) => { setJobType(e.target.value); setPage(0); }}
                className="input-enterprise py-1.5 text-xs"
              >
                <option value="">All Types</option>
                <option value="full-time">Full-time</option>
                <option value="contract">Contract</option>
                <option value="part-time">Part-time</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Experience Level</label>
              <select
                value={experience}
                onChange={(e) => { setExperience(e.target.value); setPage(0); }}
                className="input-enterprise py-1.5 text-xs"
              >
                <option value="">Any Level</option>
                <option value="junior">Junior (0–2 yrs)</option>
                <option value="mid">Mid (2–5 yrs)</option>
                <option value="senior">Senior (5–8 yrs)</option>
                <option value="lead">Lead / Staff (8+ yrs)</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Salary range (USD)</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="0"
                  placeholder="Min"
                  value={minSalary}
                  onChange={(e) => { setMinSalary(e.target.value); setPage(0); }}
                  className="input-enterprise py-1.5 text-xs"
                  aria-label="Minimum salary"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="Max"
                  value={maxSalary}
                  onChange={(e) => { setMaxSalary(e.target.value); setPage(0); }}
                  className="input-enterprise py-1.5 text-xs"
                  aria-label="Maximum salary"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1.5">Skills</label>
              <div className="flex flex-wrap gap-1">
                {SKILLS_OPTIONS.map((skill) => (
                  <button
                    key={skill}
                    onClick={() => setSelectedSkills((prev) =>
                      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
                    )}
                    className={`badge-ent cursor-pointer transition-colors ${
                      selectedSkills.includes(skill)
                        ? "badge-ent-brand"
                        : "badge-ent-neutral hover:bg-slate-200"
                    }`}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Center Feed */}
      <div className="lg:col-span-6 space-y-4">
        {/* Search Header */}
        <div className="card-enterprise p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-[#0A66C2]" />
              Remote Software Engineering Jobs
            </h1>
            <button
              onClick={() => jobsQuery.refetch()}
              disabled={jobsQuery.isFetching}
              className="btn-secondary-brand py-1 px-3 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${jobsQuery.isFetching ? "animate-spin" : ""}`} />
              {jobsQuery.isFetching ? "Refreshing..." : "Refresh jobs"}
            </button>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); setPage(0); }} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Job title, keywords, or company..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-enterprise pl-9 py-2 text-sm"
              />
            </div>
            <button type="submit" className="btn-primary-brand py-2 px-5 text-sm">
              Search
            </button>
          </form>
        </div>

        {/* Error Notice */}
        {error && (
          <div className="card-enterprise p-4 border-amber-300 bg-amber-50 text-amber-900 text-xs flex items-center justify-between">
            <span>{error}</span>
          </div>
        )}

        {/* Job List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <JobSkeleton key={i} />)}
          </div>
        ) : jobs.length === 0 ? (
          <div className="card-enterprise p-10 text-center space-y-3">
            <Briefcase className="h-10 w-10 text-slate-300 mx-auto" />
            <h3 className="font-bold text-slate-800 text-base">No positions found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              There are no job listings matching your filters.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const isSaved = savedJobIds.has(job.id);

              return (
                <div key={job.id} className="card-enterprise p-4 space-y-3 hover:border-slate-300 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 flex-shrink-0 text-sm">
                        {job.company_name?.charAt(0).toUpperCase() || "C"}
                      </div>
                      <div>
                        <Link
                          href={`/jobs/${job.id}`}
                          className="font-semibold text-slate-900 text-sm hover:text-[#0A66C2] hover:underline"
                        >
                          {job.title}
                        </Link>
                        <p className="text-xs text-slate-600 font-medium mt-0.5">{job.company_name}</p>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-slate-400" />
                            {job.location || "Remote"}
                          </span>
                          {job.salary_min && (
                            <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                              <DollarSign className="h-3 w-3 text-emerald-600" />
                              ${(job.salary_min / 1000).toFixed(0)}k–${((job.salary_max || job.salary_min + 30000) / 1000).toFixed(0)}k
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                    onClick={() => isSaved ? savedJobs.remove.mutate(job.id) : savedJobs.save.mutate(job.id)}
                        className={`p-1.5 rounded-full hover:bg-slate-100 ${isSaved ? "text-[#0A66C2]" : "text-slate-400"}`}
                        title={isSaved ? "Saved" : "Save job"}
                      >
                        <Bookmark className={`h-4 w-4 ${isSaved ? "fill-[#0A66C2]" : ""}`} />
                      </button>
                    </div>
                  </div>

                  {job.skills && job.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                      {job.skills.slice(0, 5).map((skill) => (
                        <span key={skill} className="badge-ent badge-ent-neutral">{skill}</span>
                      ))}
                      <span className="badge-ent badge-ent-brand capitalize">{job.job_type}</span>
                      {job.is_remote && <span className="badge-ent badge-ent-success">Remote</span>}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs pt-1">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="font-semibold text-[#0A66C2] hover:underline"
                    >
                      View Details & Apply →
                    </Link>
                    <span className="text-slate-400 font-mono text-[10px]">{job.source}</span>
                  </div>
                </div>
              );
            })}

            {/* Pagination */}
            <div className="flex items-center justify-between pt-2">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="btn-secondary-brand text-xs py-1.5 px-3 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </button>
              <span className="text-xs text-slate-500">Page {page + 1}</span>
              <button
                disabled={jobs.length < limit}
                onClick={() => setPage((p) => p + 1)}
                className="btn-secondary-brand text-xs py-1.5 px-3 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar */}
      <div className="lg:col-span-3">
        <RightSidebar />
      </div>
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-3">
          <div className="skeleton-box h-64 w-full" />
        </div>
        <div className="lg:col-span-6 space-y-3">
          <div className="skeleton-box h-24 w-full" />
          <div className="skeleton-box h-24 w-full" />
          <div className="skeleton-box h-24 w-full" />
        </div>
        <div className="lg:col-span-3">
          <div className="skeleton-box h-48 w-full" />
        </div>
      </div>
    }>
      <JobsContent />
    </Suspense>
  );
}
