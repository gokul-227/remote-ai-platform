"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Search, Building2, MapPin, Users,
  ArrowRight, Loader2, SlidersHorizontal, ChevronDown, ShieldCheck,
} from "lucide-react";
import api from "@/lib/api";

type Company = {
  id: string;
  name: string;
  description?: string;
  industry?: string;
  company_size?: string;
  location?: string;
  country?: string;
  website?: string;
  logo_url?: string;
  hiring_status?: string;
  tech_stack: string[];
  is_verified?: boolean;
};

const INDUSTRY_OPTIONS = [
  "Software", "FinTech", "HealthTech", "EdTech", "E-Commerce",
  "Cybersecurity", "AI/ML", "Gaming", "SaaS", "Consulting",
];

const SIZE_OPTIONS = [
  { label: "Any size", value: "" },
  { label: "1–10", value: "1-10" },
  { label: "11–50", value: "11-50" },
  { label: "51–200", value: "51-200" },
  { label: "201–500", value: "201-500" },
  { label: "500+", value: "500+" },
];

function CompanyCard({ company }: { company: Company }) {
  const initial = company.name.charAt(0).toUpperCase();

  return (
    <Link
      href={`/companies/${company.id}`}
      className="card-enterprise group block overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white text-xl font-black text-[#0A66C2] shadow-sm overflow-hidden">
            {company.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo_url} alt={company.name} className="h-full w-full object-cover" />
            ) : initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-sm font-semibold text-slate-900 group-hover:text-[#0A66C2]">
                {company.name}
              </h2>
              {company.is_verified && (
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#0A66C2]" aria-label="Verified" />
              )}
            </div>
            <p className="truncate text-xs text-slate-500">
              {[company.industry, company.company_size ? `${company.company_size} employees` : undefined]
                .filter(Boolean)
                .join(" · ") || "Company"}
            </p>
          </div>
        </div>

        {/* Meta */}
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-slate-500">
          {(company.location || company.country) && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              {[company.location, company.country].filter(Boolean).join(", ")}
            </span>
          )}
          {company.company_size && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3 shrink-0" /> {company.company_size} people
            </span>
          )}
        </div>

        {/* Description */}
        {company.description && (
          <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-slate-600">
            {company.description}
          </p>
        )}

        {/* Tech stack */}
        {company.tech_stack.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {company.tech_stack.slice(0, 5).map((tech) => (
              <span key={tech} className="badge-ent badge-ent-neutral">{tech}</span>
            ))}
            {company.tech_stack.length > 5 && (
              <span className="badge-ent badge-ent-neutral">+{company.tech_stack.length - 5}</span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          {company.hiring_status && (
            <span className={`badge-ent ${company.hiring_status === "actively_hiring" ? "badge-ent-success" : "badge-ent-neutral"}`}>
              {company.hiring_status.replace(/_/g, " ")}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs font-semibold text-[#0A66C2] opacity-0 transition-opacity group-hover:opacity-100 ml-auto">
            View company <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function CompanyCardSkeleton() {
  return (
    <div className="card-enterprise p-5">
      <div className="flex items-start gap-3">
        <div className="skeleton-box h-12 w-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="skeleton-box h-3.5 w-32 rounded" />
          <div className="skeleton-box h-3 w-20 rounded" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="skeleton-box h-3 w-full rounded" />
        <div className="skeleton-box h-3 w-3/4 rounded" />
      </div>
      <div className="mt-3 flex gap-1.5">
        <div className="skeleton-box h-5 w-16 rounded" />
        <div className="skeleton-box h-5 w-12 rounded" />
      </div>
    </div>
  );
}

export default function CompaniesDiscoveryPage() {
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounce = useCallback((value: string) => {
    const timer = setTimeout(() => setDebouncedSearch(value), 350);
    return () => clearTimeout(timer);
  }, []);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    debounce(value);
  };

  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ["companies-discovery", debouncedSearch, industry, size, verifiedOnly],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (verifiedOnly) params.set("is_verified", "true");
      params.set("limit", "24");
      const res = await api.get(`/companies/public?${params.toString()}`);
      // Filter client-side for search / industry / size until backend supports full-text
      let results: Company[] = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        results = results.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.description?.toLowerCase().includes(q) ||
            c.industry?.toLowerCase().includes(q)
        );
      }
      if (industry) results = results.filter((c) => c.industry?.toLowerCase().includes(industry.toLowerCase()));
      if (size) results = results.filter((c) => c.company_size === size);
      return results;
    },
    staleTime: 30_000,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">Discover Companies</h1>
        <p className="text-sm text-slate-500">
          Explore remote-first companies and startups actively hiring remote engineers.
        </p>
      </div>

      {/* Search bar */}
      <div className="card-enterprise overflow-hidden">
        <div className="flex items-center gap-3 p-4">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            id="company-search-input"
            type="text"
            placeholder="Search by company name, industry, or description…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            id="companies-filter-toggle"
            onClick={() => setFiltersOpen((v) => !v)}
            className="btn-subtle flex items-center gap-1.5 text-xs"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            <ChevronDown className={`h-3 w-3 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </button>
        </div>

        {filtersOpen && (
          <div className="border-t border-slate-100 bg-slate-50 p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Industry</span>
                <select
                  id="filter-industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="input-enterprise text-xs"
                >
                  <option value="">All industries</option>
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Company size</span>
                <select
                  id="filter-size"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="input-enterprise text-xs"
                >
                  {SIZE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2.5 pt-5 cursor-pointer">
                <input
                  id="filter-verified"
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={(e) => setVerifiedOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-[#0A66C2]"
                />
                <span className="text-xs font-medium text-slate-700">Verified companies only</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <CompanyCardSkeleton key={i} />)}
          </div>
        ) : companies.length === 0 ? (
          <div className="card-enterprise py-16 text-center">
            <Building2 className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="font-semibold text-slate-700">No companies found</p>
            <p className="mt-1 text-sm text-slate-500">Try broadening your search or filters.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {companies.length} compan{companies.length !== 1 ? "ies" : "y"} found
              </p>
              {verifiedOnly && (
                <span className="badge-ent badge-ent-brand flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> Verified only
                </span>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {companies.map((company) => (
                <CompanyCard key={company.id} company={company} />
              ))}
            </div>
          </>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading companies…
        </div>
      )}
    </div>
  );
}
