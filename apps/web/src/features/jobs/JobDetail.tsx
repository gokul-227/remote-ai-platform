"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useApplications } from "@/hooks/useApplications";
import { useSavedJobs } from "@/hooks/useSavedJobs";
import { useToast } from "@/components/ui/Toast";
import { Btn, Ic, Lg, Tag, timeAgo, titleCase } from "@/components/rap/kit";
import { formatPay } from "@/lib/format";
import type { JobPost } from "@/types";
import { ApplyModal } from "./ApplyModal";
import { MatchPanel } from "./MatchPanel";
import { isDirect, sourceLabel } from "./hooks";

/** Figma job detail pane — used by the jobs split view and /jobs/[id]. */
export function JobDetail({ job, headingLevel = 2 }: { job: JobPost; headingLevel?: 1 | 2 }) {
  const { user } = useAuth();
  const toast = useToast();
  const engineer = user?.role === "ENGINEER";
  const saved = useSavedJobs(engineer);
  const applications = useApplications(engineer);
  const [applying, setApplying] = useState(false);

  const isSaved = !!saved.data?.some((s) => s.id === job.id);
  const applied = !!applications.data?.some((a) => a.job.id === job.id && a.application.status !== "WITHDRAWN");
  const direct = isDirect(job);
  const pay = formatPay(job);
  const Heading = headingLevel === 1 ? "h1" : "h2";

  const toggleSave = () => {
    const m = isSaved ? saved.remove : saved.save;
    m.mutate(job.id, { onSuccess: () => toast.show(isSaved ? "Removed from saved jobs" : "Job saved", "success") });
  };

  const chips: Array<[string, string]> = [
    ["briefcase", titleCase(job.job_type)],
    ["globe", job.is_remote ? titleCase(job.remote_preference) || "Remote" : job.location || "On-site"],
    ...(job.experience_level ? [["award", titleCase(job.experience_level)] as [string, string]] : []),
    ...(pay ? [["dollar", pay] as [string, string]] : []),
  ];

  return (
    <div className="p-6">
      <div className="flex items-start gap-4">
        <Lg name={job.company_name || job.title} src={job.company_logo} s={64} r={4} />
        <div className="min-w-0 flex-1">
          {job.company_id ? <Link href={`/companies/${job.company_id}`} className="text-sm font-semibold text-slate-600 hover:underline">{job.company_name}</Link> : <p className="text-sm font-semibold text-slate-600">{job.company_name}</p>}
          <Heading className="!text-2xl !font-bold leading-tight">{job.title}</Heading>
          <p className="mt-1 text-sm text-slate-500">{[job.location, `Posted ${timeAgo(job.posted_at)}`, `via ${sourceLabel(job.source)}`].filter(Boolean).join(" - ")}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map(([i, l]) => <span key={l} className="flex items-center gap-1.5 rounded bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-700"><Ic n={i} s={14} />{l}</span>)}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!user ? (
          <Btn href={`/auth/login?redirect=${encodeURIComponent(`/jobs/${job.id}`)}`} c="!rounded-full !px-6">Sign in to apply</Btn>
        ) : !direct ? (
          job.external_url && <a href={job.external_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-[#0866ff] px-6 py-2 text-sm font-bold text-white hover:bg-[#0757d8]">Apply on {sourceLabel(job.source)}<Ic n="external" s={16} /></a>
        ) : engineer ? (
          applied ? <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-6 py-2 text-sm font-bold text-emerald-700"><Ic n="check" s={16} />Applied</span>
            : <button onClick={() => setApplying(true)} className="flex items-center gap-1.5 rounded-full bg-[#0866ff] px-6 py-2 text-sm font-bold text-white hover:bg-[#0757d8]">Apply</button>
        ) : null}
        {engineer && (
          <button onClick={toggleSave} disabled={saved.save.isPending || saved.remove.isPending} aria-pressed={isSaved} className="rounded-full border border-[#0866ff] px-6 py-2 text-sm font-bold text-[#0757d8] hover:bg-[#e7f0ff]">
            {isSaved ? "Saved" : "Save"}
          </button>
        )}
      </div>

      {engineer && <MatchPanel jobId={job.id} />}

      <h3 className="mt-6 text-lg font-bold">About the job</h3>
      <div className="mt-2 whitespace-pre-line break-words text-[15px] leading-6 text-slate-700">{job.description || "No description provided."}</div>

      {!!job.skills?.length && (<><p className="mt-4 font-bold">Skills</p><div className="mt-2 flex flex-wrap gap-2">{job.skills.map((t) => <Tag key={t} t="blue">{t}</Tag>)}</div></>)}

      <div className="mt-6 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <Lg name={job.company_name || job.title} src={job.company_logo} s={48} r={4} />
          <div className="min-w-0 flex-1"><p className="font-bold">About {job.company_name || "the company"}</p><p className="text-sm text-slate-500">{direct ? "Hiring on Remote AI Platform" : `Listed on ${sourceLabel(job.source)}`}</p></div>
          {job.company_id && <Btn v="outline" sm href={`/companies/${job.company_id}`}>View company</Btn>}
        </div>
      </div>

      <ApplyModal job={job} open={applying} onClose={() => setApplying(false)} />
    </div>
  );
}
