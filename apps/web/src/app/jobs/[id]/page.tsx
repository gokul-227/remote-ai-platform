"use client";

import Link from "next/link";
import { use } from "react";
import { useJob } from "@/features/jobs/hooks";
import { JobDetail } from "@/features/jobs/JobDetail";
import { Btn, Empty, ErrorState, Ic, Loading } from "@/components/rap/kit";

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const job = useJob(id);
  const notFound = (job.error as { response?: { status?: number } } | null)?.response?.status === 404 || (job.error as { response?: { status?: number } } | null)?.response?.status === 422;

  return (
    <div className="mx-auto max-w-[900px]">
      <Link href="/jobs" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-[#0757d8]"><Ic n="right" s={16} c="rotate-180" />All jobs</Link>
      {job.isLoading ? <Loading label="Loading role…" /> : notFound ? (
        <div className="rounded-lg border border-slate-200 bg-white"><Empty icon="briefcase" title="This job isn’t available" action={<Btn href="/jobs">Browse open roles</Btn>}>It may have been filled or removed by the company.</Empty></div>
      ) : job.isError || !job.data ? <ErrorState onRetry={() => job.refetch()} /> : (
        <article className="rounded-lg border border-slate-200 bg-white"><JobDetail job={job.data} headingLevel={1} /></article>
      )}
    </div>
  );
}
