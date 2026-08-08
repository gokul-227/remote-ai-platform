"use client";

import { useState } from "react";
import { useFreelancers } from "@/hooks/useFreelancers";
import { useCompanyApplications } from "@/hooks/useApplications";
import { useCompanyJobs } from "@/hooks/useCompanyJobs";
import { useCandidateMatches } from "@/hooks/useCandidateMatches";
import { RequireRole } from "@/components/RequireRole";

const reviewableStatuses: Record<string, string[]> = {
  SUBMITTED: ["REVIEWING"],
  REVIEWING: ["SHORTLISTED", "REJECTED"],
  SHORTLISTED: ["ACCEPTED", "REJECTED"],
  INVITED: ["REVIEWING", "ACCEPTED", "REJECTED"],
};

function CompanyCandidatesPageContent() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [minYears, setMinYears] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const [selectedJob, setSelectedJob] = useState("");
  const candidates = useFreelancers({ query, role, minYears, skills: skillFilter.split(",").map((skill) => skill.trim()).filter(Boolean), openOnly });
  const applications = useCompanyApplications();
  const companyJobs = useCompanyJobs();
  const matches = useCandidateMatches(selectedJob);
  const items = candidates.data ?? [];
  const matchByEngineer = new Map((matches.data ?? []).map((match) => [match.engineer_id, match]));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold text-slate-900">Talent recommendations</h1>
      <p className="mt-2 text-slate-600">Search public professionals, invite candidates, and manage applications.</p>

      <section className="card-enterprise mt-6 p-5">
        <h2 className="font-semibold text-slate-900">Find talent</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="input-enterprise" placeholder="Search skills, role, or keyword" aria-label="Search talent" />
          <input value={role} onChange={(event) => setRole(event.target.value)} className="input-enterprise" placeholder="Primary role" aria-label="Filter by role" />
          <input value={skillFilter} onChange={(event) => setSkillFilter(event.target.value)} className="input-enterprise" placeholder="Skills (comma separated)" aria-label="Filter by skills" />
          <input value={minYears} onChange={(event) => setMinYears(event.target.value)} className="input-enterprise" type="number" min="0" placeholder="Minimum years" aria-label="Minimum years of experience" />
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} /> Open to work</label>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="text-xs font-semibold text-slate-600" htmlFor="invite-job">Invite selected talent to</label>
          <select id="invite-job" value={selectedJob} onChange={(event) => setSelectedJob(event.target.value)} className="input-enterprise max-w-md py-2 text-sm">
            <option value="">Select one of your jobs</option>
            {(companyJobs.data ?? []).map((job: { id: string; title: string }) => <option key={job.id} value={job.id}>{job.title}</option>)}
          </select>
        </div>
      </section>

      <section className="card-enterprise mt-6 p-6">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-slate-900">Application review</h2><p className="mt-1 text-sm text-slate-500">Move candidates through your hiring pipeline.</p></div><span className="badge-enterprise">{applications.data?.length ?? 0} total</span></div>
        {applications.isLoading ? <p className="mt-5 text-sm text-slate-500">Loading applications…</p> : applications.isError ? <p className="mt-5 text-sm text-red-700">Unable to load applications.</p> : (applications.data ?? []).length === 0 ? <p className="mt-5 text-sm text-slate-500">No applications have arrived yet.</p> : <div className="mt-5 space-y-3">{(applications.data ?? []).map((item: { application: { id: string; status: string }; job: { title: string }; candidate: { full_name: string; headline?: string; skills?: string[] } }) => <article key={item.application.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold text-slate-900">{item.candidate.full_name}</p><p className="text-sm text-slate-500">{item.candidate.headline || "Remote professional"} · {item.job.title}</p><div className="mt-2 flex flex-wrap gap-1.5">{(item.candidate.skills || []).slice(0, 5).map((skill) => <span key={skill} className="badge-enterprise">{skill}</span>)}</div></div><span className="badge-enterprise shrink-0">{item.application.status}</span></div>{(reviewableStatuses[item.application.status] || []).length > 0 && <div className="mt-4 flex flex-wrap gap-2">{reviewableStatuses[item.application.status].map((nextStatus) => <button key={nextStatus} onClick={() => applications.updateStatus.mutate({ applicationId: item.application.id, status: nextStatus })} disabled={applications.updateStatus.isPending} className="btn-secondary-brand px-3 py-2 text-xs">{applications.updateStatus.isPending ? "Updating…" : nextStatus.replace("_", " ")}</button>)}</div>}</article>)}</div>}
      </section>

      <section className="mt-8"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">Talent directory</h2>{selectedJob && <span className="text-xs text-slate-500">Match scores use skills, experience, role, availability, compensation, timezone, and remote fit.</span>}</div>{candidates.isLoading ? <div className="card-enterprise mt-4 p-8 text-slate-500">Loading candidates…</div> : candidates.isError ? <div className="card-enterprise mt-4 p-8 text-red-700">Unable to load candidates. <button onClick={() => candidates.refetch()} className="font-semibold text-[#0A66C2]">Retry</button></div> : items.length === 0 ? <div className="card-enterprise mt-4 p-8 text-slate-500">No public freelancer profiles match your filters.</div> : <div className="mt-4 grid gap-4 md:grid-cols-2">{items.map((person: { id: string; headline?: string; primary_role?: string; years_of_experience?: number; skills?: string[] }) => { const match = matchByEngineer.get(person.id); return <article key={person.id} className="card-enterprise p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">{person.headline || person.primary_role || "Remote professional"}</h3><p className="mt-1 text-sm text-slate-500">{person.years_of_experience ?? 0} years experience</p></div><div className="flex items-center gap-2">{match && <span className="pill-match pill-match-high">{Math.round(match.overall_score)}% match</span>}{selectedJob && <button onClick={() => applications.invite.mutate({ jobId: selectedJob, engineerId: person.id })} disabled={applications.invite.isPending} className="btn-primary-brand shrink-0 px-3 py-2 text-xs">{applications.invite.isPending ? "Inviting…" : "Invite"}</button>}</div></div><div className="mt-3 flex flex-wrap gap-2">{(person.skills || []).slice(0, 5).map((skill) => <span key={skill} className="badge-enterprise">{skill}</span>)}</div>{match && <div className="mt-4 border-t border-slate-100 pt-3"><div className="grid grid-cols-3 gap-2 text-[11px] text-slate-500"><span>Skills <strong className="block text-slate-800">{Math.round(match.skill_score)}%</strong></span><span>Experience <strong className="block text-slate-800">{Math.round(match.experience_score)}%</strong></span><span>Role <strong className="block text-slate-800">{Math.round(match.role_score)}%</strong></span></div><p className="mt-2 text-xs leading-5 text-slate-600">{match.reasoning}</p>{match.missing_skills.length > 0 && <p className="mt-1 text-xs text-amber-700">Gaps: {match.missing_skills.join(", ")}</p>}</div>}</article>; })}</div>}</section>
    </main>
  );
}

export default function CompanyCandidatesPage() {
  return <RequireRole roles={["COMPANY", "ADMIN"]}><CompanyCandidatesPageContent /></RequireRole>;
}
