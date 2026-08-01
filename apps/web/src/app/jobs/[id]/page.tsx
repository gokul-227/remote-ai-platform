"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { MapPin, DollarSign, Briefcase, ExternalLink, ArrowLeft, Sparkles, Building2, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";

interface JobPost {
  id: string;
  title: string;
  company_name: string;
  company_logo?: string;
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
  const [job, setJob] = useState<JobPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadJob() {
      try {
        const res = await api.get(`/jobs/${id}`);
        setJob(res.data);
      } catch (err) {
        console.error("Failed to load job", err);
      } finally {
        setLoading(false);
      }
    }
    loadJob();
  }, [id]);

  if (loading) {
    return (
      <div className="py-20 text-center space-y-3">
        <div className="h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-sm">Loading job details...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <h2 className="text-xl font-bold">Job Not Found</h2>
        <Link href="/jobs" className="text-cyan-400 text-sm hover:underline">
          ← Back to All Jobs
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      <Link href="/jobs" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-cyan-400 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Remote Jobs
      </Link>

      <div className="glass-panel p-8 rounded-3xl space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-gray-800/80">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs uppercase font-mono px-2.5 py-1 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
                {job.source}
              </span>
              <span className="text-xs px-2.5 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-semibold">
                {job.is_remote ? "100% Remote" : "Hybrid"}
              </span>
            </div>
            <h1 className="text-3xl font-extrabold text-gray-100">{job.title}</h1>
            <p className="text-lg text-cyan-400 font-medium mt-1 flex items-center gap-2">
              <Building2 className="h-5 w-5" /> {job.company_name}
            </p>
          </div>

          {job.external_url && (
            <a
              href={job.external_url}
              target="_blank"
              rel="noreferrer"
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 font-medium text-sm text-white shadow-lg shadow-cyan-500/20 hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              Apply Now <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm bg-gray-900/60 p-4 rounded-2xl border border-gray-800/80">
          <div>
            <span className="text-xs text-gray-500 block">Job Type</span>
            <span className="font-semibold text-gray-200 capitalize">{job.job_type}</span>
          </div>
          <div>
            <span className="text-xs text-gray-500 block">Location</span>
            <span className="font-semibold text-gray-200">{job.location || "Worldwide"}</span>
          </div>
          <div>
            <span className="text-xs text-gray-500 block">Experience Level</span>
            <span className="font-semibold text-gray-200 capitalize">{job.experience_level || "Mid-Senior"}</span>
          </div>
          <div>
            <span className="text-xs text-gray-500 block">Est. Salary</span>
            <span className="font-semibold text-emerald-400">
              {job.salary_min ? `$${job.salary_min.toLocaleString()} ${job.currency}` : "Competitive"}
            </span>
          </div>
        </div>

        {job.skills && job.skills.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Required Skills & Tech Stack</h3>
            <div className="flex flex-wrap gap-2">
              {job.skills.map((skill, i) => (
                <span
                  key={i}
                  className="px-3 py-1 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 text-xs font-medium"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4 pt-4 border-t border-gray-800/80">
          <h3 className="text-lg font-bold text-gray-200">Job Description</h3>
          <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-line bg-gray-900/40 p-6 rounded-2xl border border-gray-800/60">
            {job.description}
          </div>
        </div>
      </div>
    </div>
  );
}
