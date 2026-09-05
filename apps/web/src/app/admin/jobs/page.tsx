"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Briefcase, ChevronLeft, ChevronRight, Pause } from "lucide-react";
import api from "@/lib/api";
import { RequireRole } from "@/components/RequireRole";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select, SearchInput } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import type { JobPost } from "@/types";

const LIMIT = 20;
const SOURCES = ["REMOTEOK", "ARBEITNOW", "REMOTIVE", "USAJOBS", "THEMUSE", "DIRECT"];

function AdminJobsContent() {
  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const queryClient = useQueryClient();

  const { data: jobs, isLoading } = useQuery<JobPost[]>({
    queryKey: ["admin-jobs", source, query, page],
    queryFn: async () => (await api.get("/jobs", { params: { source: source || undefined, query: query || undefined, skip: page * LIMIT, limit: LIMIT } })).data,
  });

  const pauseJob = useMutation({
    mutationFn: (jobId: string) => api.patch(`/admin/jobs/${jobId}/status`, { is_active: false }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-jobs"] }),
  });

  const rows = jobs ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Briefcase className="h-5 w-5 text-[#0866FF]" />Job Listings</h1>
        <p className="text-xs text-slate-500 mt-1">Manage aggregated job postings across sources. Paused jobs are removed from public listings.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <SearchInput value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Search title or company…" className="max-w-xs" />
        <Select value={source} onChange={(e) => { setSource(e.target.value); setPage(0); }} className="w-auto">
          <option value="">All sources</option>
          {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>

      <div className="card-enterprise overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Briefcase} title="No active jobs found" description="Try a different search term or source filter." />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)] bg-[var(--bg-subtle)] text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Job</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Posted</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((job) => (
                <tr key={job.id} className="border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--bg-subtle)]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{job.title}</p>
                    <p className="text-xs text-slate-500">{job.company_name}</p>
                  </td>
                  <td className="px-4 py-3"><Badge tone="neutral">{job.source}</Badge></td>
                  <td className="px-4 py-3 text-slate-500">{new Date(job.posted_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="secondary" loading={pauseJob.isPending} icon={<Pause className="h-3.5 w-3.5" />} onClick={() => pauseJob.mutate(job.id)}>
                      Pause
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="secondary" size="sm" disabled={page === 0} icon={<ChevronLeft className="h-3.5 w-3.5" />} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
        <span className="text-xs text-slate-500">Page {page + 1}</span>
        <Button variant="secondary" size="sm" disabled={rows.length < LIMIT} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

export default function AdminJobsPage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <AdminJobsContent />
    </RequireRole>
  );
}
