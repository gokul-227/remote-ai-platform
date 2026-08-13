"use client";

import { useState } from "react";
import { Users, Sparkles, Inbox } from "lucide-react";
import { useFreelancers } from "@/hooks/useFreelancers";
import { useCompanyApplications } from "@/hooks/useApplications";
import { useCompanyJobs } from "@/hooks/useCompanyJobs";
import { useCandidateMatches } from "@/hooks/useCandidateMatches";
import { RequireRole } from "@/components/RequireRole";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Badge, StatusBadge, MatchPill, type StatusTone } from "@/components/ui/Badge";
import { Input, Select, SearchInput } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

const reviewableStatuses: Record<string, string[]> = {
  SUBMITTED: ["REVIEWING"],
  REVIEWING: ["SHORTLISTED", "REJECTED"],
  SHORTLISTED: ["ACCEPTED", "REJECTED"],
  INVITED: ["REVIEWING", "ACCEPTED", "REJECTED"],
};

const STATUS_TONE: Record<string, StatusTone> = {
  SUBMITTED: "info", REVIEWING: "warning", SHORTLISTED: "info", INVITED: "info", ACCEPTED: "success", REJECTED: "danger", WITHDRAWN: "neutral",
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
    <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Candidate Discovery</h1>
        <p className="text-sm text-slate-500 mt-1">Search public professionals, invite candidates, and manage applications.</p>
      </div>

      <section className="card-enterprise p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Find talent</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search skills, role, or keyword" aria-label="Search talent" className="lg:col-span-2" />
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Primary role" aria-label="Filter by role" />
          <Input value={minYears} onChange={(e) => setMinYears(e.target.value)} type="number" min={0} placeholder="Minimum years" aria-label="Minimum years of experience" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)} placeholder="Skills (comma separated)" aria-label="Filter by skills" />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} className="rounded border-slate-300" /> Open to work only
          </label>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="text-xs font-semibold text-slate-600 shrink-0" htmlFor="invite-job">Invite selected talent to</label>
          <Select id="invite-job" value={selectedJob} onChange={(e) => setSelectedJob(e.target.value)} className="max-w-md">
            <option value="">Select one of your jobs</option>
            {(companyJobs.data ?? []).map((job: { id: string; title: string }) => <option key={job.id} value={job.id}>{job.title}</option>)}
          </Select>
        </div>
      </section>

      <section className="card-enterprise p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Application review</h2>
            <p className="mt-0.5 text-xs text-slate-500">Move candidates through your hiring pipeline.</p>
          </div>
          <Badge tone="neutral">{applications.data?.length ?? 0} total</Badge>
        </div>
        {applications.isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
        ) : applications.isError ? (
          <p className="text-sm text-red-700">Unable to load applications.</p>
        ) : (applications.data ?? []).length === 0 ? (
          <EmptyState icon={Inbox} title="No applications yet" description="Applications will appear here once candidates apply to your open roles." />
        ) : (
          <div className="space-y-3">
            {(applications.data ?? []).map((item: { application: { id: string; status: string }; job: { title: string }; candidate: { full_name: string; headline?: string; skills?: string[] } }) => (
              <article key={item.application.id} className="rounded-xl border border-[var(--border-color)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Avatar name={item.candidate.full_name} />
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{item.candidate.full_name}</p>
                      <p className="text-xs text-slate-500">{item.candidate.headline || "Remote professional"} · {item.job.title}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(item.candidate.skills || []).slice(0, 5).map((skill) => <Badge key={skill} tone="neutral">{skill}</Badge>)}
                      </div>
                    </div>
                  </div>
                  <StatusBadge label={item.application.status} tone={STATUS_TONE[item.application.status] ?? "neutral"} />
                </div>
                {(reviewableStatuses[item.application.status] || []).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {reviewableStatuses[item.application.status].map((nextStatus) => (
                      <Button
                        key={nextStatus}
                        size="sm"
                        variant="secondary"
                        loading={applications.updateStatus.isPending}
                        onClick={() => applications.updateStatus.mutate({ applicationId: item.application.id, status: nextStatus })}
                      >
                        {nextStatus.replace("_", " ")}
                      </Button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Talent Directory</h2>
          {selectedJob && <span className="text-xs text-slate-500 flex items-center gap-1"><Sparkles className="h-3 w-3 text-[var(--color-ai)]" />Match scores use skills, experience, role, availability, compensation, timezone, and remote fit.</span>}
        </div>
        {candidates.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}</div>
        ) : candidates.isError ? (
          <div className="card-enterprise p-6 text-center space-y-2">
            <p className="text-sm text-red-700">Unable to load candidates.</p>
            <Button size="sm" variant="secondary" onClick={() => candidates.refetch()}>Retry</Button>
          </div>
        ) : items.length === 0 ? (
          <div className="card-enterprise"><EmptyState icon={Users} title="No matching candidates" description="No public freelancer profiles match your filters. Try widening your search." /></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((person: { id: string; headline?: string; primary_role?: string; years_of_experience?: number; skills?: string[] }) => {
              const match = matchByEngineer.get(person.id);
              return (
                <article key={person.id} className="card-enterprise p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Avatar name={person.headline || person.primary_role || "Engineer"} />
                      <div>
                        <h3 className="font-semibold text-slate-900 text-sm">{person.headline || person.primary_role || "Remote professional"}</h3>
                        <p className="mt-0.5 text-xs text-slate-500">{person.years_of_experience ?? 0} years experience</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {match && <MatchPill score={match.overall_score} />}
                      {selectedJob && (
                        <Button size="sm" loading={applications.invite.isPending} onClick={() => applications.invite.mutate({ jobId: selectedJob, engineerId: person.id })}>
                          Invite
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(person.skills || []).slice(0, 5).map((skill) => <Badge key={skill} tone="neutral">{skill}</Badge>)}
                  </div>
                  {match && (
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-500">
                        <span>Skills <strong className="block text-slate-800">{Math.round(match.skill_score)}%</strong></span>
                        <span>Experience <strong className="block text-slate-800">{Math.round(match.experience_score)}%</strong></span>
                        <span>Role <strong className="block text-slate-800">{Math.round(match.role_score)}%</strong></span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-600">{match.reasoning}</p>
                      {match.missing_skills.length > 0 && <p className="mt-1 text-xs text-amber-700">Gaps: {match.missing_skills.join(", ")}</p>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

export default function CompanyCandidatesPage() {
  return <RequireRole roles={["COMPANY", "ADMIN"]}><CompanyCandidatesPageContent /></RequireRole>;
}
