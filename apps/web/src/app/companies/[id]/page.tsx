"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin, Users, Globe2, Building2, Briefcase,
  ChevronLeft, Loader2, ShieldCheck, ExternalLink, Code2,
} from "lucide-react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/Badge";

type Job = {
  id: string;
  title: string;
  job_type?: string;
  location?: string;
  posted_at?: string;
};

type CompanyProfile = {
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
  created_at: string;
};

export default function PublicCompanyProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data: company, isLoading, isError } = useQuery<CompanyProfile>({
    queryKey: ["public-company-profile", id],
    queryFn: () => api.get(`/companies/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  // Try to fetch the company's public job listings
  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ["company-public-jobs", id],
    queryFn: async () => {
      try {
        const res = await api.get(`/jobs/company/${id}`);
        return Array.isArray(res.data) ? res.data : res.data?.data ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!id,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading organization profile…
      </div>
    );
  }

  if (isError || !company) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Building2 className="mx-auto mb-4 h-12 w-12 text-slate-300" />
        <h1 className="text-xl font-bold text-slate-900">Organization not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          This organization profile is unavailable or has been removed.
        </p>
        <Link href="/companies" className="btn-primary-brand mt-6 inline-flex">
          <ChevronLeft className="h-4 w-4" /> Back to organizations
        </Link>
      </div>
    );
  }

  const initial = company.name.charAt(0).toUpperCase();
  const isActivelyHiring = company.hiring_status === "actively_hiring";
  const memberSince = new Date(company.created_at).getFullYear();

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link href="/companies" className="hover:text-[#B54A2C] hover:underline">Organizations</Link>
        <span>/</span>
        <span className="text-slate-700">{company.name}</span>
      </nav>

      {/* Hero card */}
      <section className="card-enterprise overflow-hidden">
        {/* Cover */}
        <div className="h-28 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500" />
        <div className="px-6 pb-6">
          <div className="-mt-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            {/* Logo + name */}
            <div className="flex items-end gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-4 border-white bg-white text-3xl font-black text-[#B54A2C] shadow-md overflow-hidden">
                {company.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={company.logo_url} alt={company.name} className="h-full w-full object-cover" />
                ) : initial}
              </div>
              <div className="pb-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-slate-900">{company.name}</h1>
                  {company.is_verified && (
                    <Badge tone="brand"><ShieldCheck className="h-3 w-3" /> Verified</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-slate-600">
                  {[company.industry, company.company_size ? `${company.company_size} employees` : undefined]
                    .filter(Boolean)
                    .join(" · ") || "Organization"}
                </p>
              </div>
            </div>
            {/* CTAs */}
            <div className="flex flex-wrap gap-2 pb-1">
              {company.website && (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noreferrer"
                  id="company-website-link"
                  className="btn-secondary-brand flex items-center gap-1.5 text-xs"
                >
                  <Globe2 className="h-3.5 w-3.5" /> Website
                </a>
              )}
            </div>
          </div>

          {/* Meta */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-500">
            {(company.location || company.country) && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0" />
                {[company.location, company.country].filter(Boolean).join(", ")}
              </span>
            )}
            {company.company_size && (
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 shrink-0" /> {company.company_size} employees
              </span>
            )}
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 hover:text-[#B54A2C] transition-colors"
              >
                <Globe2 className="h-4 w-4 shrink-0" />
                {company.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>

          {/* Status badges */}
          <div className="mt-3 flex flex-wrap gap-2">
            {company.hiring_status && (
              <Badge tone={isActivelyHiring ? "success" : "neutral"}>
                {company.hiring_status.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
        </div>
      </section>

      {/* Main content */}
      <div className="grid gap-5 lg:grid-cols-3">
        <main className="space-y-5 lg:col-span-2">
          {/* About */}
          <section className="card-enterprise p-6">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
              <Building2 className="h-4 w-4 text-slate-400" /> About {company.name}
            </h2>
            {company.description ? (
              <p className="text-sm leading-relaxed text-slate-600">{company.description}</p>
            ) : (
              <p className="text-sm text-slate-500">No organization description provided.</p>
            )}
          </section>

          {/* Tech stack */}
          {company.tech_stack.length > 0 && (
            <section className="card-enterprise p-6">
              <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
                <Code2 className="h-4 w-4 text-slate-400" /> Tech Stack
              </h2>
              <div className="flex flex-wrap gap-2">
                {company.tech_stack.map((tech) => (
                  <Badge key={tech} tone="neutral">{tech}</Badge>
                ))}
              </div>
            </section>
          )}

          {/* Open positions */}
          <section className="card-enterprise p-6">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                <Briefcase className="h-4 w-4 text-slate-400" /> Open Positions
              </h2>
              <Link
                href={`/jobs?company_id=${id}`}
                className="text-xs font-semibold text-[#B54A2C] hover:underline"
              >
                See all jobs →
              </Link>
            </div>
            {jobs.length === 0 ? (
              <p className="text-sm text-slate-500">No open positions at this time.</p>
            ) : (
              <div className="space-y-2">
                {jobs.slice(0, 6).map((job) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="flex items-center justify-between rounded-xl border border-slate-100 p-3.5 transition-colors hover:border-[#B54A2C] hover:bg-slate-50 group"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900 group-hover:text-[#B54A2C]">
                        {job.title}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        {job.job_type && <Badge tone="neutral">{job.job_type}</Badge>}
                        {job.location && <span>{job.location}</span>}
                      </div>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-[#B54A2C]" />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </main>

        {/* Sidebar */}
        <aside className="space-y-5">
          {/* Company info */}
          <section className="card-enterprise p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Organization Info</h2>
            <dl className="space-y-2.5 text-xs">
              {[
                { label: "Industry", value: company.industry },
                { label: "Size", value: company.company_size ? `${company.company_size} employees` : undefined },
                { label: "Location", value: [company.location, company.country].filter(Boolean).join(", ") || undefined },
                { label: "Hiring", value: company.hiring_status?.replace(/_/g, " ") },
                { label: "Member since", value: String(memberSince) },
              ]
                .filter((item) => item.value)
                .map((item) => (
                  <div key={item.label} className="flex justify-between gap-3">
                    <dt className="text-slate-500">{item.label}</dt>
                    <dd className="font-semibold text-slate-800 text-right">{item.value}</dd>
                  </div>
                ))}
            </dl>
          </section>

          {/* Verification */}
          {company.is_verified && (
            <section className="card-enterprise p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-8 w-8 shrink-0 text-[#B54A2C]" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Verified Organization</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Identity and business details confirmed by Remote AI Platform.
                  </p>
                </div>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
