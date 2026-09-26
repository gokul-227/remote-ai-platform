"use client";

import Link from "next/link";
import { Bar, Btn, Ic } from "@/components/rap/kit";
import { useJobMatch } from "./hooks";

/** Figma "How you match" card, backed by GET /matching/jobs/{id}. */
export function MatchPanel({ jobId }: { jobId: string }) {
  const q = useJobMatch(jobId, true);
  return (
    <div className="mt-5 rounded-xl border border-[#5B4BDB]/25 bg-[#F6F4FF] p-4" data-testid="match-panel">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-bold text-[#5B4BDB]"><Ic n="spark" s={18} />How you match</p>
        {q.data && <span className="text-2xl font-bold text-[#5B4BDB]" data-testid="match-score">{Math.round(q.data.overall_score)}%</span>}
      </div>
      {q.isLoading ? <p className="mt-3 text-sm text-slate-600">Calculating your match…</p> : q.isError ? (
        <p className="mt-3 text-sm text-slate-600">We couldn’t calculate your match right now.</p>
      ) : !q.data ? (
        <div className="mt-3 text-sm text-slate-700">
          <p>Complete your professional profile to see how you match this role.</p>
          <Btn sm c="mt-2" href="/onboarding">Complete my profile</Btn>
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {([["Skills", q.data.skill_score], ["Experience", q.data.experience_score], ["Time zone", q.data.timezone_score], ["Compensation", q.data.compensation_score], ["Role fit", q.data.role_score], ["Remote setup", q.data.remote_score]] as const).map(([l, v]) => (
              <div key={l}><div className="mb-1 flex justify-between text-xs font-semibold text-slate-600"><span>{l}</span><span>{Math.round(v)}%</span></div><Bar v={v} c="bg-[#5B4BDB]" /></div>
            ))}
          </div>
          {!!q.data.matching_skills.length && <p className="mt-3 text-sm text-emerald-700">Strong: {q.data.matching_skills.slice(0, 5).join(", ")}.</p>}
          {!!q.data.missing_skills.length && <p className="text-sm text-amber-700">Gap: {q.data.missing_skills.slice(0, 4).join(", ")} {q.data.missing_skills.length === 1 ? "appears" : "appear"} in the requirements but not on your profile. <Link href="/engineer/profile" className="font-semibold underline">Update skills</Link></p>}
          {q.data.reasoning && <p className="mt-2 text-sm text-slate-600">{q.data.reasoning}</p>}
        </>
      )}
    </div>
  );
}
