"use client";

import { useQuery } from "@tanstack/react-query";
import { use } from "react";
import Link from "next/link";
import {
  MapPin, DollarSign, Briefcase, ExternalLink, ArrowLeft,
  Building2, Bookmark, Share2, CheckCircle2, Clock,
  Sparkles,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useSavedJobs } from "@/hooks/useSavedJobs";
import { useApplications } from "@/hooks/useApplications";
import { JobMatch } from "@/hooks/useRecommendations";
import { AIMatchPanel } from "@/components/ai/MatchScore";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

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

const SOURCE_LABELS: Record<string, { label: string; tone: string }> = {
  remoteok: { label: "RemoteOK Partner", tone: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800" },
  arbeitnow: { label: "Arbeitnow Verified", tone: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800" },
  usajobs: { label: "USAJobs Verified", tone: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800" },
  themuse: { label: "The Muse Direct", tone: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-800" },
  adzuna: { label: "Adzuna Syndicated", tone: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" },
};

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const toast = useToast();
  const jobQuery = useQuery<JobPost>({
    queryKey: ["job", id],
    queryFn: async () => (await api.get(`/jobs/${id}`)).data,
  });
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

  const handleShare = () => {
    if (typeof window === "undefined") return;
    navigator.clipboard?.writeText(window.location.href);
    toast.show("Job link copied to clipboard", "success");
  };

  const handleApply = () => {
    applications.apply.mutate(
      { jobId: id },
      {
        onSuccess: () => toast.show("Application submitted successfully!", "success"),
        onError: () => toast.show("Application failed. Please try again.", "error"),
      }
    );
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
        <div className="skeleton-box h-6 w-32" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="card-enterprise p-8 space-y-4">
              <div className="skeleton-box h-10 w-2/3" />
              <div className="skeleton-box h-6 w-1/3" />
              <div className="skeleton-box h-4 w-full" />
              <div className="skeleton-box h-32 w-full" />
            </div>
          </div>
          <div className="skeleton-box h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <Briefcase className="h-12 w-12 text-slate-300 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Position Not Found</h2>
        <p className="text-sm text-slate-500">This position may have been filled or the listing is no longer active.</p>
        <Link href="/jobs">
          <Button icon={<ArrowLeft className="h-4 w-4" />}>Browse All Positions</Button>
        </Link>
      </div>
    );
  }

  const sourceMeta = SOURCE_LABELS[job.source?.toLowerCase()] ?? {
    label: `${job.source || "WorkMesh"} Direct`,
    tone: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-5">
      <Link href="/jobs" className="inline-flex items-center gap-2 text-xs font-semibold text-[#0A66C2] hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to Jobs Marketplace
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main Job Body */}
        <div className="lg:col-span-2 space-y-5">
          {/* Header Card */}
          <div className="card-enterprise p-6 space-y-5">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-start gap-4">
                <div className="h-14 w-14 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 text-xl shrink-0">
                  {job.company_name?.charAt(0).toUpperCase() || "C"}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sourceMeta.tone}`}>
                      {sourceMeta.label}
                    </span>
                    <span className="badge-ent badge-ent-brand font-semibold">
                      {job.is_remote ? "100% Remote" : "Hybrid"}
                    </span>
                  </div>

                  <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{job.title}</h1>

                  <p className="text-sm text-[#0A66C2] font-semibold mt-1 flex items-center gap-2">
                    <Building2 className="h-4 w-4" /> {job.company_name}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-2">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" /> {job.location || "Worldwide (Remote)"}
                    </span>
                    {job.salary_min && (
                      <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold">
                        <DollarSign className="h-3.5 w-3.5" />
                        ${(job.salary_min / 1000).toFixed(0)}k–${((job.salary_max || job.salary_min + 30000) / 1000).toFixed(0)}k {job.currency}
                      </span>
                    )}
                    {job.posted_at && (
                      <span className="flex items-center gap-1 text-slate-400">
                        <Clock className="h-3.5 w-3.5" /> {new Date(job.posted_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions Header Toolbar */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => user && (saved ? savedJobs.remove.mutate(id) : savedJobs.save.mutate(id))}
                  className={`p-2.5 rounded-lg border transition-colors ${
                    saved
                      ? "bg-sky-50 border-sky-200 text-[#0A66C2] dark:bg-sky-950/40"
                      : "border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                  title={saved ? "Saved" : "Save Job"}
                >
                  <Bookmark className={`h-4 w-4 ${saved ? "fill-[#0A66C2]" : ""}`} />
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  title="Share Position"
                >
                  <Share2 className="h-4 w-4" />
                </button>

                {job.external_url ? (
                  <a
                    href={job.external_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary-brand py-2 px-5 text-sm flex items-center gap-2"
                  >
                    Apply on {job.source || "Partner"} <ExternalLink className="h-4 w-4" />
                  </a>
                ) : isEngineer ? (
                  alreadyApplied ? (
                    <span className="btn-secondary-brand py-2 px-5 text-sm flex items-center gap-2 cursor-default text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" /> Applied
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      loading={applications.apply.isPending}
                      onClick={handleApply}
                      className="px-6"
                    >
                      Apply Now
                    </Button>
                  )
                ) : !user ? (
                  <Link href="/auth/login" className="btn-primary-brand py-2 px-5 text-sm">
                    Sign in to Apply
                  </Link>
                ) : null}
              </div>
            </div>

            {/* Quick Metadata Spec Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <span className="text-[11px] text-slate-500 block font-medium">Employment</span>
                <span className="font-bold text-slate-900 dark:text-white capitalize">{job.job_type || "Full-time"}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block font-medium">Location</span>
                <span className="font-bold text-slate-900 dark:text-white">{job.location || "Remote Worldwide"}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block font-medium">Seniority</span>
                <span className="font-bold text-slate-900 dark:text-white capitalize">{job.experience_level || "Mid-Senior"}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block font-medium">Annual Budget</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {job.salary_min ? `$${job.salary_min.toLocaleString()} ${job.currency}` : "Competitive"}
                </span>
              </div>
            </div>

            {/* Required Technology Skills */}
            {job.skills && job.skills.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Required Skills & Stack</h3>
                <div className="flex flex-wrap gap-1.5">
                  {job.skills.map((skill, i) => (
                    <span key={i} className="badge-ent badge-ent-neutral text-xs py-1 px-2.5">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Detailed Description */}
            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Role Overview & Responsibilities</h3>
              <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line bg-slate-50/50 dark:bg-slate-800/40 p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                {job.description}
              </div>
            </div>
          </div>
        </div>

        {/* Right Rail: AI Match Panel & Company Showcase */}
        <div className="space-y-5">
          {isEngineer ? (
            <AIMatchPanel
              match={matchQuery.data}
              loading={matchQuery.isLoading}
              emptyHint="Complete your engineer profile to unlock explainable compatibility scoring for this position."
            />
          ) : !user ? (
            <div className="card-enterprise p-5 text-center space-y-3">
              <span className="badge-ai inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold">
                <Sparkles className="h-3.5 w-3.5 text-[#7F56D9]" /> Explainable AI Scoring
              </span>
              <p className="text-xs text-slate-500">
                Sign in with an engineer profile to view your algorithmic compatibility score and skill gap breakdown.
              </p>
              <Link href="/auth/login">
                <Button size="sm" variant="secondary" fullWidth>
                  Sign In
                </Button>
              </Link>
            </div>
          ) : null}

          {/* Company Snapshot Card */}
          <div className="card-enterprise p-5 space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-[#0A66C2]" /> About {job.company_name}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Verified remote employer hiring engineers through WorkMesh.
            </p>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">Source</span>
              <span className="font-semibold text-slate-900 dark:text-white capitalize">{job.source}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
