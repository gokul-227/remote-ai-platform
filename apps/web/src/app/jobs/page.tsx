"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Search,
  MapPin,
  DollarSign,
  Filter,
  ExternalLink,
  Briefcase,
  RefreshCw,
  Building2,
  Clock,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  X,
} from "lucide-react";
import api from "@/lib/api";

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
  "React", "TypeScript", "Python", "Node.js", "Go", "Rust", "Java",
  "AWS", "Kubernetes", "Docker", "PostgreSQL", "GraphQL",
  "Machine Learning", "LLM", "Data Engineering", "DevOps", "Terraform",
];

const EXPERIENCE_OPTIONS = [
  { value: "", label: "Any level" },
  { value: "junior", label: "Junior (0–2 yrs)" },
  { value: "mid", label: "Mid (2–5 yrs)" },
  { value: "senior", label: "Senior (5–8 yrs)" },
  { value: "lead", label: "Lead / Staff (8+ yrs)" },
];

const JOB_TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "full-time", label: "Full-time" },
  { value: "contract", label: "Contract" },
  { value: "part-time", label: "Part-time" },
];

function SkeletonCard() {
  return (
    <div className="card p-5 space-y-3 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="skeleton h-10 w-10 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-3/4 rounded" />
          <div className="skeleton h-3 w-1/2 rounded" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="skeleton h-5 w-16 rounded-md" />
        <div className="skeleton h-5 w-20 rounded-md" />
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3].map((i) => <div key={i} className="skeleton h-5 w-14 rounded" />)}
      </div>
      <div className="skeleton h-8 w-full rounded-lg" />
    </div>
  );
}

function EmptyState({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="col-span-full text-center py-20 space-y-4">
      <div className="h-16 w-16 rounded-2xl bg-slate-800/50 border border-white/5 flex items-center justify-center mx-auto">
        <Briefcase className="h-8 w-8 text-slate-600" />
      </div>
      <h3 className="text-lg font-semibold text-slate-200">No jobs found</h3>
      <p className="text-sm text-slate-500 max-w-sm mx-auto">
        {query
          ? `No results for "${query}". Try different keywords or clear your filters.`
          : "No jobs match your current filters. Try adjusting your search."}
      </p>
      <button onClick={onClear} className="btn-secondary text-sm inline-flex items-center gap-2 mx-auto">
        <X className="h-3.5 w-3.5" /> Clear filters
      </button>
    </div>
  );
}

function JobCard({ job }: { job: JobPost }) {
  const matchScore = Math.floor(55 + Math.random() * 40); // TODO: replace with real AI score
  const scoreClass =
    matchScore >= 85 ? "match-score-high" :
    matchScore >= 65 ? "match-score-medium" :
    "match-score-low";

  const postedDate = new Date(job.posted_at);
  const daysAgo = Math.floor((Date.now() - postedDate.getTime()) / (1000 * 60 * 60 * 24));
  const timeLabel = daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : `${daysAgo}d ago`;

  return (
    <div className="card card-interactive p-5 space-y-4 group animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 border border-white/10 flex items-center justify-center flex-shrink-0">
          <Building2 className="h-5 w-5 text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white group-hover:text-cyan-300 transition-colors text-sm leading-snug line-clamp-2">
            {job.title}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">{job.company_name}</p>
        </div>
        <div className={`match-score text-[10px] flex-shrink-0 ${scoreClass}`}>
          {matchScore}%
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="flex items-center gap-1 text-slate-500">
          <MapPin className="h-3 w-3 text-slate-600" />
          {job.location || "Remote"}
        </span>
        {job.salary_min && (
          <span className="flex items-center gap-1 text-emerald-400 font-medium">
            <DollarSign className="h-3 w-3" />
            ${(job.salary_min / 1000).toFixed(0)}k
            {job.salary_max ? `–$${(job.salary_max / 1000).toFixed(0)}k` : "+"}
          </span>
        )}
        <span className="flex items-center gap-1 text-slate-500">
          <Clock className="h-3 w-3 text-slate-600" />
          {timeLabel}
        </span>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        <span className="badge badge-neutral">{job.job_type}</span>
        {job.experience_level && (
          <span className="badge badge-secondary">{job.experience_level}</span>
        )}
        <span className="badge badge-primary">{job.source}</span>
      </div>

      {/* Skills */}
      {job.skills?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {job.skills.slice(0, 5).map((skill) => (
            <span key={skill} className="tag">{skill}</span>
          ))}
          {job.skills.length > 5 && (
            <span className="tag text-slate-600">+{job.skills.length - 5}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
        <Link
          href={`/jobs/${job.id}`}
          className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
        >
          View details →
        </Link>
        <div className="flex items-center gap-1">
          {job.external_url && (
            <a
              href={job.external_url}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost p-1.5"
              title="Open original listing"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function JobsPage() {
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("query") || "");
  const [jobType, setJobType] = useState("");
  const [experience, setExperience] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 12;

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { limit, skip: page * limit };
      if (searchQuery) params.query = searchQuery;
      if (jobType) params.job_type = jobType;
      if (experience) params.experience_level = experience;

      const res = await api.get("/jobs", { params });
      const data: JobPost[] = Array.isArray(res.data) ? res.data : (res.data.items ?? []);
      setJobs(data);
      setTotal(res.data.total ?? data.length);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load jobs";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, jobType, experience, page]);

  useEffect(() => {
    fetchJobs();
  }, [jobType, experience, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchJobs();
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      await api.post("/jobs/sync", null, { params: { limit_per_source: 20 } });
      await fetchJobs();
    } catch (e) {
      console.error("Sync failed", e);
    } finally {
      setSyncing(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setJobType("");
    setExperience("");
    setSelectedSkills([]);
    setPage(0);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Remote Engineering Jobs</h1>
          <p className="text-sm text-slate-500 mt-1">
            {total > 0 ? `${total.toLocaleString()} jobs aggregated from public APIs` : "Searching live job feeds..."}
          </p>
        </div>
        <button
          onClick={handleManualSync}
          disabled={syncing}
          className="btn-secondary text-sm inline-flex items-center gap-2 flex-shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Sources"}
        </button>
      </div>

      {/* ── Search + Filters Bar ── */}
      <div className="card p-4 mb-6 space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search title, skill, keyword (e.g. React, Python, DevOps)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-9 text-sm"
            />
          </div>
          <button type="submit" className="btn-primary text-sm px-5 flex-shrink-0">
            Search
          </button>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`btn-secondary text-sm px-3 flex-shrink-0 ${showFilters ? "border-cyan-500/40 text-cyan-300" : ""}`}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </form>

        {/* Filter dropdowns */}
        {showFilters && (
          <div className="pt-3 border-t border-white/5 flex flex-wrap gap-3 items-end animate-fade-in">
            <div className="space-y-1">
              <label className="text-xs text-slate-500 font-medium">Job Type</label>
              <select
                value={jobType}
                onChange={(e) => { setJobType(e.target.value); setPage(0); }}
                className="input-field text-sm py-1.5 pr-8 min-w-[130px]"
              >
                {JOB_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500 font-medium">Experience</label>
              <select
                value={experience}
                onChange={(e) => { setExperience(e.target.value); setPage(0); }}
                className="input-field text-sm py-1.5 pr-8 min-w-[150px]"
              >
                {EXPERIENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[200px] space-y-1">
              <label className="text-xs text-slate-500 font-medium">Skills</label>
              <div className="flex flex-wrap gap-1.5">
                {SKILLS_OPTIONS.slice(0, 10).map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => setSelectedSkills((prev) =>
                      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
                    )}
                    className={`tag text-xs cursor-pointer ${selectedSkills.includes(skill) ? "tag-primary" : ""}`}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={clearFilters} className="btn-ghost text-xs text-slate-500 self-end mb-0.5">
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          </div>
        )}

        {/* Active filter chips */}
        {(searchQuery || jobType || experience || selectedSkills.length > 0) && (
          <div className="flex flex-wrap gap-2 items-center pt-1">
            <span className="text-xs text-slate-600">Active filters:</span>
            {searchQuery && (
              <span className="badge badge-primary gap-1">
                "{searchQuery}"
                <button onClick={() => setSearchQuery("")} className="ml-0.5 opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
              </span>
            )}
            {jobType && (
              <span className="badge badge-secondary gap-1">
                {jobType}
                <button onClick={() => setJobType("")}><X className="h-3 w-3" /></button>
              </span>
            )}
            {experience && (
              <span className="badge badge-neutral gap-1">
                {experience}
                <button onClick={() => setExperience("")}><X className="h-3 w-3" /></button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Main Layout ── */}
      <div className="space-y-4">
        {/* Error state */}
        {error && (
          <div className="card border-red-500/20 p-4 flex items-center gap-3 animate-fade-in">
            <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
              <X className="h-4 w-4 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-red-300">Failed to load jobs</p>
              <p className="text-xs text-slate-500">{error}. Try refreshing or syncing sources.</p>
            </div>
            <button onClick={fetchJobs} className="btn-secondary ml-auto text-xs">Retry</button>
          </div>
        )}

        {/* Job Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading
            ? Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)
            : jobs.length === 0
            ? <EmptyState query={searchQuery} onClear={clearFilters} />
            : jobs.map((job) => <JobCard key={job.id} job={job} />)
          }
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-6">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-secondary py-2 px-3 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-slate-400">
              Page <strong className="text-white">{page + 1}</strong> of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="btn-secondary py-2 px-3 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
