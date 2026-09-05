"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Briefcase, Eye, Pause, Play } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useCompanyJobs } from "@/hooks/useCompanyJobs";
import { useCompanyApplications } from "@/hooks/useApplications";
import { RequireRole } from "@/components/RequireRole";

interface CompanyJob {
  id: string;
  title: string;
  job_type: string;
  is_active: boolean;
  created_at: string;
}

interface ApplicationRow {
  application: { status: string };
  job: { id: string };
}

const SHORTLISTED_OR_LATER = new Set(["SHORTLISTED", "ACCEPTED"]);

function CompanyJobsPageContent() {
  const jobs = useCompanyJobs(true);
  const applications = useCompanyApplications(true);
  const queryClient = useQueryClient();

  const toggleActive = useMutation({
    mutationFn: ({ jobId, is_active }: { jobId: string; is_active: boolean }) =>
      api.patch(`/jobs/${jobId}`, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-jobs"] }),
  });

  const countsByJob = useMemo(() => {
    const counts = new Map<string, { applicants: number; shortlisted: number }>();
    for (const row of (applications.data ?? []) as ApplicationRow[]) {
      const jobId = row.job.id;
      const entry = counts.get(jobId) ?? { applicants: 0, shortlisted: 0 };
      entry.applicants += 1;
      if (SHORTLISTED_OR_LATER.has(row.application.status)) entry.shortlisted += 1;
      counts.set(jobId, entry);
    }
    return counts;
  }, [applications.data]);

  const rows: CompanyJob[] = jobs.data ?? [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Job postings</h1>
          <p className="mt-1 text-sm text-slate-600">Manage roles and projects published by your company.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/jobs/new" className="btn-primary-brand text-sm">Post a job</Link>
          <Link href="/company/dashboard" className="btn-secondary-brand text-sm">Hiring Dashboard</Link>
        </div>
      </div>

      {jobs.isLoading ? (
        <div className="card-enterprise p-8 space-y-3">
          <div className="skeleton-box h-4 w-full" />
          <div className="skeleton-box h-4 w-5/6" />
          <div className="skeleton-box h-4 w-2/3" />
        </div>
      ) : jobs.isError ? (
        <div className="card-enterprise p-8 text-center space-y-3">
          <p className="text-sm text-red-700">Unable to load your job postings.</p>
          <button onClick={() => jobs.refetch()} className="btn-secondary-brand text-sm">Try again</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="card-enterprise p-10 text-center space-y-2">
          <Briefcase className="h-8 w-8 text-slate-300 mx-auto" />
          <h2 className="font-semibold text-slate-900">No job postings yet</h2>
          <p className="text-sm text-slate-500">Positions you publish will appear here with applicant and pipeline stats.</p>
          <Link href="/jobs/new" className="btn-primary-brand text-sm inline-flex mt-2">Post your first job</Link>
        </div>
      ) : (
        <div className="card-enterprise overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-semibold">Job</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold text-right">Applicants</th>
                <th className="px-5 py-3 font-semibold text-right">Shortlisted</th>
                <th className="px-5 py-3 font-semibold">Created</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((job) => {
                const counts = countsByJob.get(job.id) ?? { applicants: 0, shortlisted: 0 };
                return (
                  <tr key={job.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <Link href={`/jobs/${job.id}`} className="font-semibold text-slate-900 hover:text-[#0552CC]">{job.title}</Link>
                      <p className="text-[11px] text-slate-500 capitalize mt-0.5">{job.job_type}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`badge-ent ${job.is_active ? "badge-ent-success" : "badge-ent-neutral"}`}>
                        {job.is_active ? "Active" : "Paused"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-slate-800">{counts.applicants}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-slate-800">{counts.shortlisted}</td>
                    <td className="px-5 py-3.5 text-slate-500">
                      {new Date(job.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/jobs/${job.id}`} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="View job">
                          <Eye className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => toggleActive.mutate({ jobId: job.id, is_active: !job.is_active })}
                          disabled={toggleActive.isPending}
                          className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                          title={job.is_active ? "Pause posting" : "Resume posting"}
                        >
                          {job.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export default function CompanyJobsPage() {
  return (
    <RequireRole roles={["COMPANY", "ADMIN"]}>
      <CompanyJobsPageContent />
    </RequireRole>
  );
}
