"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  MapPin,
  SlidersHorizontal,
  X,
  ArrowUpDown,
  Globe,
  Zap,
} from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { RightSidebar } from "@/components/RightSidebar";
import { JobCard } from "@/components/JobCard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { JobCardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useJobs } from "@/hooks/useJobs";
import { useSavedJobs } from "@/hooks/useSavedJobs";
import { useAuth } from "@/lib/auth";
import type { JobPost } from "@/types";

const SORT_OPTIONS = [
  { value: "relevance", label: "Most Relevant" },
  { value: "date", label: "Newest First" },
  { value: "salary_high", label: "Salary: High → Low" },
  { value: "salary_low", label: "Salary: Low → High" },
] as const;

type SortKey = typeof SORT_OPTIONS[number]["value"];

const REMOTE_PILLS = [
  { label: "🌐 Remote", location: "Remote" },
  { label: "🌍 EU Remote", location: "EU" },
  { label: "🗽 US Remote", location: "United States" },
  { label: "🇬🇧 UK Remote", location: "United Kingdom" },
] as const;

function sortJobs(jobs: JobPost[], sort: SortKey): JobPost[] {
  return [...jobs].sort((a, b) => {
    if (sort === "date") return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    if (sort === "salary_high") return (b.salary_max ?? b.salary_min ?? 0) - (a.salary_max ?? a.salary_min ?? 0);
    if (sort === "salary_low") return (a.salary_min ?? a.salary_max ?? 0) - (b.salary_min ?? b.salary_max ?? 0);
    return 0; // relevance = API order
  });
}

const POPULAR_SKILLS = [
  "React",
  "TypeScript",
  "Python",
  "Node.js",
  "Go",
  "Rust",
  "AWS",
  "Kubernetes",
  "Docker",
  "PostgreSQL",
  "FastAPI",
  "GraphQL",
];

export default function JobsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-4">
          <div className="skeleton-box h-12 w-full rounded-xl" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-3 skeleton-box h-96 rounded-xl" />
            <div className="lg:col-span-9 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton-box h-32 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <JobsContent />
    </Suspense>
  );
}

function JobsContent() {
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("query") || "");
  const [locationQuery, setLocationQuery] = useState("");
  const [companyId] = useState(searchParams.get("company_id") || "");
  const [jobType, setJobType] = useState("");
  const [experience, setExperience] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [minSalary, setMinSalary] = useState("");
  const [maxSalary, setMaxSalary] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("relevance");

  const limit = 10;

  const { user } = useAuth();
  const jobsQuery = useJobs({
    limit,
    skip: page * limit,
    query: searchQuery || undefined,
    company_id: companyId || undefined,
    job_type: jobType || undefined,
    experience_level: experience || undefined,
    min_salary: minSalary || undefined,
    max_salary: maxSalary || undefined,
    skills: selectedSkills.length ? selectedSkills : undefined,
  });
  const savedJobs = useSavedJobs(!!user);
  const rawJobs: JobPost[] = jobsQuery.data || [];
  const jobs = sortJobs(
    rawJobs
      .filter((j) =>
        locationQuery ? (j.location ?? "").toLowerCase().includes(locationQuery.toLowerCase()) : true
      )
      .filter((j) => (remoteOnly ? j.is_remote : true)),
    sortKey
  );
  const loading = jobsQuery.isLoading;

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
    setPage(0);
  };

  const handleReset = () => {
    setSearchQuery("");
    setLocationQuery("");
    setJobType("");
    setExperience("");
    setRemoteOnly(false);
    setMinSalary("");
    setMaxSalary("");
    setSelectedSkills([]);
    setSortKey("relevance");
    setPage(0);
  };

  const activeFilterCount =
    (jobType ? 1 : 0) +
    (experience ? 1 : 0) +
    (remoteOnly ? 1 : 0) +
    (minSalary ? 1 : 0) +
    (maxSalary ? 1 : 0) +
    selectedSkills.length;

  return (
    <div className="space-y-5">
      {/* Top Search Command Bar */}
      <div className="card-enterprise p-4 sm:p-5 shadow-xs">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
          }}
          className="flex flex-col md:flex-row gap-3"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by job title, tech stack, company, or keyword..."
              className="input-enterprise pl-10 h-11 text-xs sm:text-sm"
            />
          </div>
          <div className="relative md:w-64">
            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              placeholder="Remote, Worldwide, EU..."
              className="input-enterprise pl-10 h-11 text-xs sm:text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="lg" className="h-11 px-6">
              Search Roles
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="h-11 lg:hidden"
              onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
              icon={<SlidersHorizontal className="h-4 w-4" />}
            >
              {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters"}
            </Button>
          </div>
        </form>

        {/* Quick Skill Tags */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 mr-1">Popular:</span>
          {POPULAR_SKILLS.map((skill) => {
            const isSelected = selectedSkills.includes(skill);
            return (
              <button
                key={skill}
                type="button"
                onClick={() => toggleSkill(skill)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-all ${
                  isSelected
                    ? "bg-[#B54A2C] text-white shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                {skill}
              </button>
            );
          })}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={handleReset}
              className="text-[11px] text-red-600 hover:underline font-semibold ml-auto flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Main 3-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Filter Rail */}
        <div className={`lg:col-span-3 space-y-4 ${mobileFiltersOpen ? "block" : "hidden lg:block"}`}>
          <div className="card-enterprise p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-[#B54A2C]" /> Filter Roles
              </h3>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-[#B54A2C] hover:underline font-medium"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="space-y-4">
              {/* Remote Only Toggle */}
              <label className="flex items-center justify-between cursor-pointer p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  100% Remote Only
                </span>
                <input
                  type="checkbox"
                  checked={remoteOnly}
                  onChange={(e) => {
                    setRemoteOnly(e.target.checked);
                    setPage(0);
                  }}
                  className="rounded text-[#B54A2C] focus:ring-[#B54A2C] h-4 w-4"
                />
              </label>

              {/* Job Type */}
              <Select
                label="Employment Type"
                value={jobType}
                onChange={(e) => {
                  setJobType(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">All Types</option>
                <option value="full-time">Full-time</option>
                <option value="contract">Contract</option>
                <option value="part-time">Part-time</option>
                <option value="freelance">Freelance</option>
              </Select>

              {/* Experience Level */}
              <Select
                label="Seniority Level"
                value={experience}
                onChange={(e) => {
                  setExperience(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">Any Seniority</option>
                <option value="junior">Junior (0–2 yrs)</option>
                <option value="mid">Mid-level (2–5 yrs)</option>
                <option value="senior">Senior (5–8 yrs)</option>
                <option value="lead">Lead / Staff (8+ yrs)</option>
              </Select>

              {/* Salary Range */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Salary Range (USD / Year)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="0"
                    placeholder="Min ($)"
                    value={minSalary}
                    onChange={(e) => {
                      setMinSalary(e.target.value);
                      setPage(0);
                    }}
                    className="input-enterprise py-1.5 text-xs"
                    aria-label="Minimum salary"
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="Max ($)"
                    value={maxSalary}
                    onChange={(e) => {
                      setMaxSalary(e.target.value);
                      setPage(0);
                    }}
                    className="input-enterprise py-1.5 text-xs"
                    aria-label="Maximum salary"
                  />
                </div>
              </div>
            </div>
          </div>

          <Sidebar />
        </div>

        {/* Center Results Stream */}
        <div className="lg:col-span-6 space-y-4">
          {/* Remote Quick Pills */}
          <div className="flex flex-wrap gap-1.5">
            {REMOTE_PILLS.map((pill) => {
              const active = locationQuery === pill.location;
              return (
                <button
                  key={pill.label}
                  onClick={() => {
                    setLocationQuery(active ? "" : pill.location);
                    setPage(0);
                  }}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                    active
                      ? "bg-[#B54A2C] text-white border-[#B54A2C] shadow-xs"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-[#B54A2C]/40"
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          {/* Results Summary Header */}
          <div className="flex items-center justify-between gap-3 text-xs text-slate-500 px-1">
            <span>
              {loading ? (
                <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-amber-400 animate-pulse" />Searching verified opportunities...</span>
              ) : (
                <>
                  <strong className="text-slate-900 dark:text-white">{jobs.length}</strong> remote engineering {jobs.length === 1 ? "role" : "roles"}
                  {searchQuery && <> for &quot;<strong>{searchQuery}</strong>&quot;</>}
                </>
              )}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1">
                <ArrowUpDown className="h-3 w-3 text-slate-400" />
                <select
                  value={sortKey}
                  onChange={(e) => { setSortKey(e.target.value as SortKey); setPage(0); }}
                  className="text-[11px] font-medium text-slate-700 dark:text-slate-300 bg-transparent focus:outline-none cursor-pointer"
                  aria-label="Sort jobs"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <span className="badge-ent badge-ent-brand text-[10px] hidden sm:inline-flex"><Globe className="h-3 w-3" />Live
              </span>
            </div>
          </div>

          {/* Job Listings List */}
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <JobCardSkeleton key={i} />)
            ) : jobs.length === 0 ? (
              <div className="card-enterprise">
                <EmptyState
                  icon={Briefcase}
                  title="No positions matched your criteria"
                  description="Try adjusting your filters or search keywords to discover more remote opportunities."
                  actionLabel="Reset Search Filters"
                  actionHref="/jobs"
                />
              </div>
            ) : (
              jobs.map((job) => {
                const isSaved = !!savedJobs.data?.some((s: JobPost) => s.id === job.id);
                return (
                  <JobCard
                    key={job.id}
                    job={job}
                    saved={isSaved}
                    onToggleSave={
                      user
                        ? () => (isSaved ? savedJobs.remove.mutate(job.id) : savedJobs.save.mutate(job.id))
                        : undefined
                    }
                  />
                );
              })
            )}
          </div>

          {/* Pagination Controls */}
          {!loading && jobs.length > 0 && (
            <div className="card-enterprise p-4 flex items-center justify-between">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 0}
                onClick={() => {
                  setPage((p) => Math.max(0, p - 1));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                icon={<ChevronLeft className="h-4 w-4" />}
              >
                Previous
              </Button>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Page {page + 1}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={jobs.length < limit}
                onClick={() => {
                  setPage((p) => p + 1);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Next <ChevronRight className="h-4 w-4 ml-1 inline" />
              </Button>
            </div>
          )}
        </div>

        {/* Right Rail: AI Spotlight & Trending */}
        <div className="lg:col-span-3 space-y-4">
          <RightSidebar />
        </div>
      </div>
    </div>
  );
}
