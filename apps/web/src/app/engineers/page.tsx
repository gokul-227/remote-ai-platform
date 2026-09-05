"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Search, MapPin, Briefcase, Clock, Sparkles,
  ChevronDown, SlidersHorizontal, User, ArrowRight, Loader2,
} from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

type Engineer = {
  id: string;
  full_name?: string;
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
  const color = clamped >= 75 ? "#059669" : clamped >= 50 ? "#D97706" : "#0866FF";

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
  const displayName = engineer.full_name || engineer.headline || engineer.primary_role || "Remote professional";
  const initials = (engineer.full_name || engineer.primary_role || engineer.headline || "E")
    .split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  const avatarGradients = [
    "from-blue-500 to-indigo-600",
    "from-violet-500 to-purple-700",
    "from-emerald-500 to-teal-600",
    "from-rose-500 to-pink-600",
    "from-amber-500 to-orange-600",
  ];
  const gradientIdx = engineer.id.charCodeAt(0) % avatarGradients.length;

  return (
    <div className="card-enterprise group flex flex-col overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      {/* Card top bar gradient line */}
      <div className={`h-1 w-full bg-gradient-to-r ${avatarGradients[gradientIdx]} opacity-80`} />

      <div className="p-5 flex-1 flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${avatarGradients[gradientIdx]} text-sm font-bold text-white shadow-sm`}>
            {initials}
            {engineer.is_open_to_work && (
              <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-white" title="Open to work" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold text-slate-900 group-hover:text-[#0866FF] transition-colors">
              {displayName}
            </h2>
            <p className="truncate text-xs text-slate-500 mt-0.5">
              {(engineer.headline || engineer.primary_role) && engineer.full_name
                ? engineer.headline || engineer.primary_role
                : engineer.primary_role || "Software Engineer"}
            </p>
          </div>
          {engineer.profile_score != null && <ScoreRing score={Math.round(engineer.profile_score)} />}
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
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
          <p className="line-clamp-2 text-xs leading-relaxed text-slate-600">{engineer.bio}</p>
        )}

        {/* Skills */}
        {engineer.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {engineer.skills.slice(0, 5).map((skill) => (
              <Badge key={skill} tone="neutral">{skill}</Badge>
            ))}
            {engineer.skills.length > 5 && (
              <Badge tone="neutral">+{engineer.skills.length - 5}</Badge>
            )}
          </div>
        )}

        {/* Keyword matches */}
        {engineer.matching_keywords && engineer.matching_keywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {engineer.matching_keywords.slice(0, 3).map((kw) => (
              <span key={kw} className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--color-brand-light)] text-[#0866FF]">
                ✓ {kw}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between border-t border-slate-100 px-5 py-3 bg-slate-50/60">
        {engineer.is_open_to_work ? (
          <Badge tone="success">Open to work</Badge>
        ) : (
          <Badge tone="neutral">{engineer.availability || "Not available"}</Badge>
        )}
        <Link
          href={`/engineers/${engineer.id}`}
          className="text-xs font-semibold text-[#0866FF] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          View profile <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
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
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-[#0A3A6E] to-[#0866FF] px-8 py-10 text-white shadow-xl">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 30% 50%, white 1px, transparent 1px), radial-gradient(circle at 70% 80%, white 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold backdrop-blur-sm border border-white/20">
                🌐 Remote Talent Network
              </span>
              <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-3 py-1 text-[11px] font-semibold">
                ● Live
              </span>
            </div>
            <h1 className="text-3xl font-black tracking-tight">Discover Professionals</h1>
            <p className="mt-2 text-sm text-blue-100/80 max-w-md">
              Browse verified remote professionals with structured profiles, AI-matched skills, and real availability signals.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 shrink-0">
            {[
              { label: "Verified Professionals", value: "2,400+" },
              { label: "Open to Work", value: "38%" },
              { label: "Avg Response", value: "< 48h" },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <div className="text-2xl font-black text-white">{value}</div>
                <div className="text-[10px] text-blue-200/70 font-medium mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
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
          <Button
            id="engineers-filter-toggle"
            variant="ghost"
            size="sm"
            onClick={() => setFiltersOpen((v) => !v)}
            icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
          >
            Filters
            <ChevronDown className={`h-3 w-3 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </Button>
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
                  className="h-4 w-4 rounded border-slate-300 accent-[#0866FF]"
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
          <div className="card-enterprise">
            <EmptyState icon={User} title="No professionals found" description="Try broadening your search filters." />
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {engineers.length} professional{engineers.length !== 1 ? "s" : ""} found
              </p>
              {openOnly && (
                <Badge tone="success"><Sparkles className="h-3 w-3" /> Open to work</Badge>
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
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-600 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading professionals…
        </div>
      )}
    </div>
  );
}
