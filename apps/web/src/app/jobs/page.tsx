"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Briefcase, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { RightSidebar } from "@/components/RightSidebar";
import { JobCard } from "@/components/JobCard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { JobCardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { useJobs } from "@/hooks/useJobs";
import { useSavedJobs } from "@/hooks/useSavedJobs";
import type { JobPost } from "@/types";

const SKILLS_OPTIONS = [
  "React", "TypeScript", "Python", "Node.js", "Go", "Rust",
  "AWS", "Kubernetes", "Docker", "PostgreSQL", "FastAPI", "GraphQL",
];

function JobsContent() {
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("query") || "");
  const [companyId] = useState(searchParams.get("company_id") || "");
  const [jobType, setJobType] = useState("");
  const [experience, setExperience] = useState("");
  const [minSalary, setMinSalary] = useState("");
  const [maxSalary, setMaxSalary] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [page, setPage] = useState(0);

  const limit = 10;

  const jobsQuery = useJobs({ limit, skip: page * limit, query: searchQuery || undefined, company_id: companyId || undefined, job_type: jobType || undefined, experience_level: experience || undefined, min_salary: minSalary || undefined, max_salary: maxSalary || undefined, skills: selectedSkills.length ? selectedSkills : undefined });
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

          <div className="space-y-3">
            <Select
              label="Job Type"
              value={jobType}
              onChange={(e) => { setJobType(e.target.value); setPage(0); }}
            >
              <option value="">All Types</option>
              <option value="full-time">Full-time</option>
              <option value="contract">Contract</option>
              <option value="part-time">Part-time</option>
            </Select>

            <Select
              label="Experience Level"
              value={experience}
              onChange={(e) => { setExperience(e.target.value); setPage(0); }}
            >
              <option value="">Any Level</option>
              <option value="junior">Junior (0–2 yrs)</option>
              <option value="mid">Mid (2–5 yrs)</option>
              <option value="senior">Senior (5–8 yrs)</option>
              <option value="lead">Lead / Staff (8+ yrs)</option>
            </Select>

            <div>
              <label className="text-sm font-medium text-[var(--text-main)] block mb-1.5">Salary range (USD)</label>
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
              <label className="text-sm font-medium text-[var(--text-main)] block mb-1.5">Skills</label>
              <div className="flex flex-wrap gap-1.5">
                {SKILLS_OPTIONS.map((skill) => {
                  const active = selectedSkills.includes(skill);
                  return (
                    <button
                      key={skill}
                      onClick={() => setSelectedSkills((prev) =>
                        prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
                      )}
                      className="cursor-pointer"
                    >
                      <Badge tone={active ? "brand" : "neutral"}>{skill}</Badge>
                    </button>
                  );
                })}
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => jobsQuery.refetch()}
              loading={jobsQuery.isFetching}
              icon={!jobsQuery.isFetching ? <RefreshCw className="h-3.5 w-3.5" /> : undefined}
            >
              {jobsQuery.isFetching ? "Refreshing…" : "Refresh jobs"}
            </Button>
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
            <Button type="submit" size="lg">Search</Button>
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
            {Array.from({ length: 5 }).map((_, i) => <JobCardSkeleton key={i} />)}
          </div>
        ) : jobs.length === 0 ? (
          <div className="card-enterprise">
            <EmptyState
              icon={Briefcase}
              title="No positions found"
              description="There are no job listings matching your filters. Try widening your search or clearing filters."
              actionLabel="Clear filters"
              onAction={() => { setSearchQuery(""); setJobType(""); setExperience(""); setMinSalary(""); setMaxSalary(""); setSelectedSkills([]); setPage(0); }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                saved={savedJobIds.has(job.id)}
                onToggleSave={(j) => (savedJobIds.has(j.id) ? savedJobs.remove.mutate(j.id) : savedJobs.save.mutate(j.id))}
              />
            ))}

            {/* Pagination */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                icon={<ChevronLeft className="h-3.5 w-3.5" />}
              >
                Previous
              </Button>
              <span className="text-xs text-slate-500">Page {page + 1}</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={jobs.length < limit}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
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
