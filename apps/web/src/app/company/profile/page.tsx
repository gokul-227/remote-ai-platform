"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2, MapPin, Globe2, Users, Briefcase, ExternalLink,
  Loader2, Pencil, ShieldCheck, PlusCircle, Sparkles,
} from "lucide-react";
import api from "@/lib/api";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { useCompanyJobs } from "@/hooks/useCompanyJobs";
import { RequireRole } from "@/components/RequireRole";
import { Button } from "@/components/ui/Button";
import { EditCompanyProfileDrawer } from "./EditCompanyProfileDrawer";

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

type CompanyJob = { id: string; title: string; job_type: string; posted_at: string; is_remote?: boolean };

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
    <div className="card-enterprise mx-auto max-w-2xl p-8 space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center">
          <Building2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Create Organization Profile</h1>
          <p className="text-xs text-slate-500">Establish your organization brand to attract top remote engineering talent.</p>
        </div>
      </div>

      <form
        onSubmit={(event) => { event.preventDefault(); createProfile.mutate(); }}
        className="space-y-4"
      >
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
          Organization Name
          <input
            required
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className="input-enterprise mt-1.5"
            placeholder="e.g. Acme Cloud Corp"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Primary Industry
            <input
              value={form.industry}
              onChange={(e) => update("industry", e.target.value)}
              className="input-enterprise mt-1.5"
              placeholder="e.g. Cloud Infrastructure / SaaS"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Organization Size
            <input
              value={form.company_size}
              onChange={(e) => update("company_size", e.target.value)}
              className="input-enterprise mt-1.5"
              placeholder="e.g. 50–200"
            />
          </label>
        </div>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
          Headquarters / Remote Footprint
          <input
            value={form.location}
            onChange={(e) => update("location", e.target.value)}
            className="input-enterprise mt-1.5"
            placeholder="e.g. San Francisco / Remote Worldwide"
          />
        </label>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
          Organization Overview & Mission
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            className="input-enterprise mt-1.5 min-h-24"
            placeholder="Describe what your engineering teams build, your culture, and technical challenges..."
          />
        </label>
        {createProfile.isError && <p className="text-sm text-red-600">Unable to create organization profile. Please try again.</p>}
        <Button type="submit" loading={createProfile.isPending} disabled={!form.name.trim()} fullWidth>
          Create Organization Profile
        </Button>
      </form>
    </div>
  );
}

function CompanyProfileContent() {
  const profileQuery = useCompanyProfile();
  const jobsQuery = useCompanyJobs();
  const profile = profileQuery.data as CompanyProfile | undefined;
  const jobs = (jobsQuery.data as CompanyJob[] | undefined) ?? [];
  const [editOpen, setEditOpen] = useState(false);

  if (profileQuery.isLoading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading organization profile...
      </div>
    );
  }

  if (profileQuery.isError || !profile) {
    return <CreateCompanyProfileForm />;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <EditCompanyProfileDrawer open={editOpen} onClose={() => setEditOpen(false)} profile={profile} />

      {/* Header Card with Rich Gradient Banner */}
      <div className="card-enterprise overflow-hidden">
        <div className="h-36 relative overflow-hidden bg-gradient-to-br from-[#2B1D14] via-[#4D4033] to-[#B54A2C]">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
          <div className="absolute bottom-4 left-6 flex items-center gap-2">
            <span className="text-xs font-bold text-white/80 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Verified Employer
            </span>
          </div>
        </div>

        <div className="px-6 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-12 mb-4">
            <div className="flex items-end gap-4">
              <div className="h-24 w-24 rounded-2xl bg-white dark:bg-slate-800 border-4 border-white dark:border-slate-800 shadow-md flex items-center justify-center text-3xl font-black text-[#B54A2C] overflow-hidden shrink-0">
                {profile.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.logo_url} alt={profile.name} className="h-full w-full object-cover" />
                ) : (
                  profile.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="pb-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{profile.name}</h1>
                  <span className="badge-ent badge-ent-brand text-[10px]">Verified</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 font-medium">
                  {[profile.industry, profile.company_size ? `${profile.company_size} employees` : undefined].filter(Boolean).join(" · ") || "Engineering Employer"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/jobs/new">
                <Button size="sm" icon={<PlusCircle className="h-3.5 w-3.5" />}>Post Job</Button>
              </Link>
              <Button variant="secondary" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditOpen(true)}>
                Edit Profile
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400 mb-4">
            {(profile.location || profile.country) && (
              <span className="flex items-center gap-1.5 font-medium">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                {[profile.location, profile.country].filter(Boolean).join(", ")}
              </span>
            )}
            {profile.company_size && (
              <span className="flex items-center gap-1.5 font-medium">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                {profile.company_size} employees
              </span>
            )}
            {profile.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-[#B54A2C] hover:underline font-semibold transition-colors"
              >
                <Globe2 className="h-3.5 w-3.5" />
                {profile.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {profile.hiring_status && (
              <span className="badge-ent badge-ent-success">
                {profile.hiring_status.replace(/_/g, " ")}
              </span>
            )}
            {(profile.tech_stack ?? []).slice(0, 8).map((tech) => (
              <span key={tech} className="badge-ent badge-ent-neutral text-[10px]">
                {tech}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left Column: About & Open Jobs */}
        <div className="lg:col-span-2 space-y-5">
          {/* About Company */}
          <div className="card-enterprise p-6 space-y-3">
            <h2 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#B54A2C]" /> About {profile.name}
            </h2>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
              {profile.description || "No organization description provided yet. Add an overview to showcase your engineering culture and goals to candidates."}
            </p>
          </div>

          {/* Open Positions */}
          <div className="card-enterprise p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-emerald-600" /> Active Job Postings ({jobs.length})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Live listings published on Remote AI Platform marketplace</p>
              </div>
              <Link href="/jobs/new" className="text-xs font-semibold text-[#B54A2C] hover:underline flex items-center gap-1">
                Post Role <PlusCircle className="h-3.5 w-3.5" />
              </Link>
            </div>

            {jobsQuery.isLoading ? (
              <p className="text-xs text-slate-500">Loading positions…</p>
            ) : jobs.length === 0 ? (
              <div className="py-6 text-center space-y-2">
                <p className="text-xs text-slate-500">No active positions posted yet.</p>
                <Link href="/jobs/new">
                  <Button size="sm" icon={<PlusCircle className="h-3.5 w-3.5" />}>
                    Create First Job
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2.5">
                {jobs.slice(0, 6).map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-[#B54A2C] transition-colors"
                  >
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white text-xs">{job.title}</h3>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                        <span className="badge-ent badge-ent-neutral text-[10px]">{job.job_type}</span>
                        <span>{new Date(job.posted_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/jobs/${job.id}`} className="text-xs text-[#B54A2C] hover:underline font-semibold flex items-center gap-1">
                        View <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Rail: Verified Credentials & Quick Details */}
        <div className="space-y-5">
          <div className="card-enterprise p-5 space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
              Organization Summary
            </h3>
            <dl className="space-y-3 text-xs">
              {[
                { label: "Industry", value: profile.industry },
                { label: "Team Size", value: profile.company_size ? `${profile.company_size} employees` : undefined },
                { label: "Location", value: [profile.location, profile.country].filter(Boolean).join(", ") || undefined },
                { label: "Hiring Status", value: profile.hiring_status?.replace(/_/g, " ") },
              ]
                .filter((item) => item.value)
                .map((item) => (
                  <div key={item.label} className="flex justify-between gap-3 border-b border-slate-50 dark:border-slate-800 pb-2">
                    <dt className="text-slate-500 font-medium">{item.label}</dt>
                    <dd className="text-slate-900 dark:text-white font-semibold text-right">{item.value}</dd>
                  </div>
                ))}
            </dl>
          </div>

          <div className="card-enterprise p-5 space-y-3 bg-gradient-to-br from-indigo-50/50 to-blue-50/50 dark:from-indigo-950/30 dark:to-blue-950/30 border-indigo-100 dark:border-indigo-900">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#7F56D9]" /> AI Candidate Matching
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Your open jobs are automatically analyzed against candidate skill matrices to rank applicants by technical fit.
            </p>
            <Link href="/company/candidates" className="block pt-1">
              <Button size="sm" variant="secondary" fullWidth>
                Explore Talent Directory
              </Button>
            </Link>
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
