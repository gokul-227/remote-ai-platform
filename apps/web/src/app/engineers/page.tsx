"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Search, MapPin, Briefcase, Clock, Sparkles,
  ChevronDown, SlidersHorizontal, User, ArrowRight, Loader2,
} from "lucide-react";
import api from "@/lib/api";

type Engineer = {
  id: string;
  headline?: string;
  bio?: string;
  location?: string;
  timezone?: string;
  primary_role?: string;
  years_of_experience?: number;
  skills: string[];
  availability?: string;
  is_open_to_work?: boolean;
  profile_score?: number;
  matching_keywords?: string[];
};

const ROLE_OPTIONS = [
  "Backend Engineer", "Frontend Engineer", "Full-Stack Engineer",
  "DevOps Engineer", "ML Engineer", "Data Engineer",
  "Mobile Engineer", "Security Engineer", "Platform Engineer",
];

const EXPERIENCE_OPTIONS = [
  { label: "Any experience", value: "" },
  { label: "1+ years", value: "1" },
  { label: "3+ years", value: "3" },
  { label: "5+ years", value: "5" },
  { label: "8+ years", value: "8" },
  { label: "10+ years", value: "10" },
];

function ScoreRing({ score }: { score: number }) {
  const clamped = Math.min(100, Math.max(0, score));
  const r = 18;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (clamped / 100) * circumference;
  const color = clamped >= 75 ? "#059669" : clamped >= 50 ? "#D97706" : "#0A66C2";

  return (
    <div className="relative flex h-12 w-12 items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#e5e7eb" strokeWidth="3.5" />
        <circle
          cx="24" cy="24" r={r} fill="none"
          stroke={color} strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <span className="text-xs font-bold" style={{ color }}>{clamped}</span>
    </div>
  );
}

function EngineerCard({ engineer }: { engineer: Engineer }) {
  const initials = (engineer.headline || engineer.primary_role || "E")
    .split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <Link
      href={`/engineers/${engineer.id}`}
      className="card-enterprise group block overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-bold text-white shadow-sm">
              {initials}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-slate-900 group-hover:text-[#0A66C2]">
                {engineer.headline || engineer.primary_role || "Engineer"}
              </h2>
              <p className="truncate text-xs text-slate-500">{engineer.primary_role || "Software Engineer"}</p>
            </div>
          </div>
          {engineer.profile_score != null && <ScoreRing score={Math.round(engineer.profile_score)} />}
        </div>

        {/* Meta row */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
          {engineer.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              {engineer.location}
            </span>
          )}
          {engineer.years_of_experience != null && (
            <span className="flex items-center gap-1">
              <Briefcase className="h-3 w-3 shrink-0" />
              {engineer.years_of_experience}y exp
            </span>
          )}
          {engineer.timezone && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              {engineer.timezone}
            </span>
          )}
        </div>

        {/* Bio */}
        {engineer.bio && (
          <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-slate-600">{engineer.bio}</p>
        )}

        {/* Skills */}
        {engineer.skills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {engineer.skills.slice(0, 5).map((skill) => (
              <span key={skill} className="badge-ent badge-ent-neutral">{skill}</span>
            ))}
            {engineer.skills.length > 5 && (
              <span className="badge-ent badge-ent-neutral">+{engineer.skills.length - 5}</span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          {engineer.is_open_to_work ? (
            <span className="badge-ent badge-ent-success">Open to work</span>
          ) : (
            <span className="badge-ent badge-ent-neutral">{engineer.availability || "Not available"}</span>
          )}
          <span className="flex items-center gap-1 text-xs font-semibold text-[#0A66C2] opacity-0 transition-opacity group-hover:opacity-100">
            View profile <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function EngineerCardSkeleton() {
  return (
    <div className="card-enterprise p-5">
      <div className="flex items-start gap-3">
        <div className="skeleton-box h-11 w-11 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="skeleton-box h-3.5 w-36 rounded" />
          <div className="skeleton-box h-3 w-24 rounded" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="skeleton-box h-3 w-full rounded" />
        <div className="skeleton-box h-3 w-4/5 rounded" />
      </div>
      <div className="mt-3 flex gap-1.5">
        <div className="skeleton-box h-5 w-14 rounded" />
        <div className="skeleton-box h-5 w-18 rounded" />
        <div className="skeleton-box h-5 w-12 rounded" />
      </div>
    </div>
  );
}

export default function EngineersDiscoveryPage() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [minExp, setMinExp] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Debounced search value
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounce = useCallback((value: string) => {
    const timer = setTimeout(() => setDebouncedSearch(value), 350);
    return () => clearTimeout(timer);
  }, []);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    debounce(value);
  };

  const { data: engineers = [], isLoading } = useQuery<Engineer[]>({
    queryKey: ["engineers-discovery", debouncedSearch, role, minExp, openOnly],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("query", debouncedSearch);
      if (role) params.set("primary_role", role);
      if (minExp) params.set("min_years_exp", minExp);
      if (openOnly) params.set("is_open_to_work", "true");
      params.set("limit", "24");
      const res = await api.get(`/engineers/search?${params.toString()}`);
      return res.data;
    },
    staleTime: 30_000,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">Discover Engineers</h1>
        <p className="text-sm text-slate-500">
          Browse verified remote engineers with structured profiles and AI-matched skills.
        </p>
      </div>

      {/* Search bar */}
      <div className="card-enterprise overflow-hidden">
        <div className="flex items-center gap-3 p-4">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            id="engineer-search-input"
            type="text"
            placeholder="Search by skill, role, or keyword…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            id="engineers-filter-toggle"
            onClick={() => setFiltersOpen((v) => !v)}
            className="btn-subtle flex items-center gap-1.5 text-xs"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            <ChevronDown className={`h-3 w-3 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Expandable filters */}
        {filtersOpen && (
          <div className="border-t border-slate-100 bg-slate-50 p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Role</span>
                <select
                  id="filter-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="input-enterprise text-xs"
                >
                  <option value="">All roles</option>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Experience</span>
                <select
                  id="filter-experience"
                  value={minExp}
                  onChange={(e) => setMinExp(e.target.value)}
                  className="input-enterprise text-xs"
                >
                  {EXPERIENCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2.5 pt-5 cursor-pointer">
                <input
                  id="filter-open-to-work"
                  type="checkbox"
                  checked={openOnly}
                  onChange={(e) => setOpenOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-[#0A66C2]"
                />
                <span className="text-xs font-medium text-slate-700">Open to work only</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <EngineerCardSkeleton key={i} />)}
          </div>
        ) : engineers.length === 0 ? (
          <div className="card-enterprise py-16 text-center">
            <User className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="font-semibold text-slate-700">No engineers found</p>
            <p className="mt-1 text-sm text-slate-500">Try broadening your search filters.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {engineers.length} engineer{engineers.length !== 1 ? "s" : ""} found
              </p>
              {openOnly && (
                <span className="badge-ent badge-ent-success flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Open to work
                </span>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {engineers.map((eng) => (
                <EngineerCard key={eng.id} engineer={eng} />
              ))}
            </div>
          </>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading engineers…
        </div>
      )}
    </div>
  );
}
