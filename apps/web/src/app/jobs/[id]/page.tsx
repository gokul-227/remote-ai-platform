"use client";

import { useQuery } from "@tanstack/react-query";
import { use } from "react";
import Link from "next/link";
import { MapPin, DollarSign, Briefcase, ExternalLink, ArrowLeft, Building2, Bookmark, Share2, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useSavedJobs } from "@/hooks/useSavedJobs";
import { useApplications } from "@/hooks/useApplications";
import { JobMatch } from "@/hooks/useRecommendations";
import { AIMatchPanel } from "@/components/ai/MatchScore";

interface JobPost {
  id: string;
  title: string;
  company_name: string;
  location?: string;
  description: string;
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

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const jobQuery = useQuery<JobPost>({ queryKey: ["job", id], queryFn: async () => (await api.get(`/jobs/${id}`)).data });
  const savedJobs = useSavedJobs(!!user);
  const applications = useApplications(!!user && user.role === "ENGINEER");
  const isEngineer = user?.role === "ENGINEER";
  const matchQuery = useQuery<JobMatch>({
    queryKey: ["job-match", id],
    queryFn: async () => (await api.get(`/matching/jobs/${id}`)).data,
    enabled: isEngineer,
    retry: false,
  });
  const job = jobQuery.data || null;
  const loading = jobQuery.isLoading;
  const saved = !!savedJobs.data?.some((item: JobPost) => item.id === id);
  const alreadyApplied = !!applications.data?.some((entry: { job: { id: string } }) => entry.job.id === id);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <div className="skeleton-box h-6 w-32" />
        <div className="card-enterprise p-8 space-y-4">
          <div className="skeleton-box h-10 w-2/3" />
          <div className="skeleton-box h-6 w-1/3" />
          <div className="skeleton-box h-4 w-full" />
          <div className="skeleton-box h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <Briefcase className="h-12 w-12 text-slate-300 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900">Position Not Found</h2>
        <p className="text-sm text-slate-500">This position may have been filled or the listing is no longer active.</p>
        <Link href="/jobs" className="btn-primary-brand py-2 px-4 text-xs inline-flex">
          ← Browse All Positions
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-5">
      <Link href="/jobs" className="inline-flex items-center gap-2 text-xs font-semibold text-[#0A66C2] hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to Jobs
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
      {/* Job Header Card */}
      <div className="card-enterprise p-6 space-y-5">
        <div className="flex flex-col md:flex-row justify-between items-start gap-4 pb-5 border-b border-slate-200">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-xl flex-shrink-0">
              {job.company_name?.charAt(0).toUpperCase() || "C"}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="badge-ent badge-ent-neutral uppercase font-mono text-[10px]">{job.source}</span>
                <span className="badge-ent badge-ent-brand font-semibold">{job.is_remote ? "100% Remote" : "Hybrid"}</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900">{job.title}</h1>
              <p className="text-sm text-[#0A66C2] font-semibold mt-1 flex items-center gap-2">
                <Building2 className="h-4 w-4" /> {job.company_name}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-2">
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location || "Worldwide"}</span>
                {job.salary_min && (
                  <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                    <DollarSign className="h-3 w-3" />
                    ${(job.salary_min / 1000).toFixed(0)}k–${((job.salary_max || job.salary_min + 30000) / 1000).toFixed(0)}k
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => user && (saved ? savedJobs.remove.mutate(id) : savedJobs.save.mutate(id))}
              className={`p-2 rounded-lg border transition-colors ${saved ? "bg-sky-50 border-sky-200 text-[#0A66C2]" : "border-slate-200 text-slate-400 hover:bg-slate-50"}`}
              title="Save job"
            >
              <Bookmark className={`h-5 w-5 ${saved ? "fill-[#0A66C2]" : ""}`} />
            </button>
            <button
              onClick={() => navigator.clipboard?.writeText(window.location.href)}
              className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50"
              title="Copy link to this job"
            >
              <Share2 className="h-5 w-5" />
            </button>
            {job.external_url ? (
              <a
                href={job.external_url}
                target="_blank"
                rel="noreferrer"
                className="btn-primary-brand py-2 px-5 text-sm flex items-center gap-2"
              >
                Apply <ExternalLink className="h-4 w-4" />
              </a>
            ) : user?.role === "ENGINEER" ? (
              alreadyApplied ? (
                <span className="btn-secondary-brand py-2 px-5 text-sm flex items-center gap-2 cursor-default">
                  <CheckCircle2 className="h-4 w-4" /> Applied
                </span>
              ) : (
                <button
                  onClick={() => applications.apply.mutate({ jobId: id })}
                  disabled={applications.apply.isPending}
                  className="btn-primary-brand py-2 px-5 text-sm disabled:opacity-70"
                >
                  {applications.apply.isPending ? "Applying…" : "Apply"}
                </button>
              )
            ) : !user ? (
              <Link href="/auth/login" className="btn-primary-brand py-2 px-5 text-sm">
                Sign in to apply
              </Link>
            ) : null}
          </div>
        </div>

        {/* Job metadata row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div>
            <span className="text-[11px] text-slate-500 block font-medium">Type</span>
            <span className="font-semibold text-slate-800 capitalize">{job.job_type}</span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 block font-medium">Location</span>
            <span className="font-semibold text-slate-800">{job.location || "Worldwide"}</span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 block font-medium">Seniority</span>
            <span className="font-semibold text-slate-800 capitalize">{job.experience_level || "Mid-Senior"}</span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 block font-medium">Compensation</span>
            <span className="font-semibold text-emerald-700">
              {job.salary_min ? `$${job.salary_min.toLocaleString()} ${job.currency}` : "Competitive"}
            </span>
          </div>
        </div>

        {/* Skills */}
        {job.skills && job.skills.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Required Skills</h3>
            <div className="flex flex-wrap gap-1.5">
              {job.skills.map((skill, i) => (
                <span key={i} className="badge-ent badge-ent-neutral">{skill}</span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div className="space-y-2.5 pt-4 border-t border-slate-200">
          <h3 className="text-base font-bold text-slate-900">About this role</h3>
          <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50 p-5 rounded-xl border border-slate-200">
            {job.description}
          </div>
        </div>
      </div>
      </div>

      {/* Right rail: AI match */}
      <div className="lg:col-span-1">
        {isEngineer ? (
          <AIMatchPanel
            match={matchQuery.data}
            loading={matchQuery.isLoading}
            emptyHint="Complete your engineer profile to see your AI match score for this role."
          />
        ) : !user ? (
          <div className="card-enterprise p-5 text-center space-y-2">
            <p className="text-xs text-slate-500">
              <Link href="/auth/login" className="text-[#0A66C2] font-semibold hover:underline">Sign in</Link> as an engineer to see your AI match score for this role.
            </p>
          </div>
        ) : null}
      </div>
      </div>
    </div>
  );
}
