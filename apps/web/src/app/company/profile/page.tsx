"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  MapPin,
  Globe2,
  Users,
  Briefcase,
  ExternalLink,
  Loader2,
} from "lucide-react";
import api from "@/lib/api";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { useCompanyJobs } from "@/hooks/useCompanyJobs";
import { RequireRole } from "@/components/RequireRole";

type CompanyProfile = {
  name: string;
  website?: string;
  logo_url?: string;
  description?: string;
  industry?: string;
  company_size?: string;
  location?: string;
  country?: string;
  hiring_status?: string;
  tech_stack?: string[];
  is_verified?: boolean;
};

type CompanyJob = { id: string; title: string; job_type: string; posted_at: string };

function CreateCompanyProfileForm() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", industry: "", company_size: "", location: "", description: "" });
  const createProfile = useMutation({
    mutationFn: () =>
      api.post("/companies/me", {
        name: form.name,
        industry: form.industry || undefined,
        company_size: form.company_size || undefined,
        location: form.location || undefined,
        description: form.description || undefined,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-profile"] }),
  });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="card-enterprise mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-bold text-slate-900">Create your company profile</h1>
      <p className="mt-1 text-sm text-slate-600">This is what candidates will see when you post a job.</p>
      <form
        onSubmit={(event) => { event.preventDefault(); createProfile.mutate(); }}
        className="mt-5 space-y-4"
      >
        <label className="block text-sm font-semibold text-slate-700">Company name<input required value={form.name} onChange={(e) => update("name", e.target.value)} className="input-enterprise mt-1.5" placeholder="Acme Corp" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700">Industry<input value={form.industry} onChange={(e) => update("industry", e.target.value)} className="input-enterprise mt-1.5" placeholder="Software" /></label>
          <label className="block text-sm font-semibold text-slate-700">Company size<input value={form.company_size} onChange={(e) => update("company_size", e.target.value)} className="input-enterprise mt-1.5" placeholder="11-50" /></label>
        </div>
        <label className="block text-sm font-semibold text-slate-700">Location<input value={form.location} onChange={(e) => update("location", e.target.value)} className="input-enterprise mt-1.5" placeholder="Remote-first" /></label>
        <label className="block text-sm font-semibold text-slate-700">Description<textarea value={form.description} onChange={(e) => update("description", e.target.value)} className="input-enterprise mt-1.5 min-h-24" placeholder="What does your company do?" /></label>
        {createProfile.isError && <p className="text-sm text-red-600">Unable to create your company profile. Please try again.</p>}
        <button type="submit" disabled={createProfile.isPending || !form.name} className="btn-primary-brand text-sm disabled:opacity-70">
          {createProfile.isPending ? "Creating…" : "Create company profile"}
        </button>
      </form>
    </div>
  );
}

function CompanyProfileContent() {
  const profileQuery = useCompanyProfile();
  const jobsQuery = useCompanyJobs();
  const profile = profileQuery.data as CompanyProfile | undefined;
  const jobs = (jobsQuery.data as CompanyJob[] | undefined) ?? [];

  if (profileQuery.isLoading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading company profile
      </div>
    );
  }

  if (profileQuery.isError || !profile) {
    return <CreateCompanyProfileForm />;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      {/* Header Card */}
      <div className="card-enterprise overflow-hidden">
        <div className="h-32 bg-slate-200 border-b border-slate-200" />
        <div className="px-6 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-10 mb-4">
            <div className="flex items-end gap-4">
              <div className="h-20 w-20 rounded-2xl bg-white border-4 border-white shadow-sm flex items-center justify-center text-3xl font-black text-[#0A66C2] overflow-hidden">
                {profile.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.logo_url} alt={profile.name} className="h-full w-full object-cover" />
                ) : (
                  profile.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="pb-1">
                <h1 className="text-2xl font-bold text-slate-900">{profile.name}</h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  {[profile.industry, profile.company_size].filter(Boolean).join(" · ") || "Company profile"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-slate-500 mb-4">
            {(profile.location || profile.country) && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                {[profile.location, profile.country].filter(Boolean).join(", ")}
              </span>
            )}
            {profile.company_size && (
              <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-slate-400" />{profile.company_size} employees</span>
            )}
            {profile.website && (
              <a href={profile.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-[#0A66C2] transition-colors">
                <Globe2 className="h-3.5 w-3.5" />{profile.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {profile.hiring_status && <span className="badge-ent badge-ent-success">{profile.hiring_status.replace(/_/g, " ")}</span>}
            {profile.is_verified && <span className="badge-ent badge-ent-brand">Verified</span>}
            {(profile.tech_stack ?? []).slice(0, 6).map((tech) => (
              <span key={tech} className="badge-ent badge-ent-neutral">{tech}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left Content */}
        <div className="lg:col-span-2 space-y-5">
          {/* About */}
          <div className="card-enterprise p-6 space-y-3">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-400" /> About
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {profile.description || "No company description added yet."}
            </p>
          </div>

          {/* Open Positions */}
          <div className="card-enterprise p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-slate-400" /> Open Positions
              </h2>
              <Link href="/jobs/new" className="text-xs font-semibold text-[#0A66C2] hover:underline flex items-center gap-1">
                Post Position
              </Link>
            </div>
            {jobsQuery.isLoading ? (
              <p className="text-sm text-slate-500">Loading positions…</p>
            ) : jobs.length === 0 ? (
              <p className="text-sm text-slate-500">No open positions posted yet.</p>
            ) : (
              <div className="space-y-3">
                {jobs.slice(0, 5).map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-colors">
                    <div>
                      <h3 className="font-semibold text-slate-900 text-sm">{job.title}</h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span className="badge-ent badge-ent-neutral">{job.job_type}</span>
                        <span>{new Date(job.posted_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <Link href="/company/jobs" className="text-xs text-[#0A66C2] hover:underline font-semibold flex items-center gap-1">
                      Manage <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-5">
          <div className="card-enterprise p-5 space-y-4">
            <h3 className="font-semibold text-slate-900 text-sm">Company Info</h3>
            <dl className="space-y-2.5 text-xs">
              {[
                { label: "Industry", value: profile.industry },
                { label: "Size", value: profile.company_size ? `${profile.company_size} employees` : undefined },
                { label: "Location", value: [profile.location, profile.country].filter(Boolean).join(", ") || undefined },
                { label: "Hiring status", value: profile.hiring_status?.replace(/_/g, " ") },
              ]
                .filter((item) => item.value)
                .map((item) => (
                  <div key={item.label} className="flex justify-between gap-3">
                    <dt className="text-slate-500 font-medium">{item.label}</dt>
                    <dd className="text-slate-800 font-semibold text-right">{item.value}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CompanyProfile() {
  return (
    <RequireRole roles={["COMPANY", "ADMIN"]}>
      <CompanyProfileContent />
    </RequireRole>
  );
}
