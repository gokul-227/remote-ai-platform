"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Users, Sparkles, Inbox, MapPin, ExternalLink,
  ArrowRight, Filter,
} from "lucide-react";
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
import { useToast } from "@/components/ui/Toast";

const reviewableStatuses: Record<string, string[]> = {
  SUBMITTED: ["REVIEWING"],
  REVIEWING: ["SHORTLISTED", "REJECTED"],
  SHORTLISTED: ["ACCEPTED", "REJECTED"],
  INVITED: ["REVIEWING", "ACCEPTED", "REJECTED"],
};

const STATUS_TONE: Record<string, StatusTone> = {
  SUBMITTED: "info",
  REVIEWING: "warning",
  SHORTLISTED: "info",
  INVITED: "info",
  ACCEPTED: "success",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
};

function CompanyCandidatesPageContent() {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [minYears, setMinYears] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const [selectedJob, setSelectedJob] = useState("");

  const candidates = useFreelancers({
    query,
    role,
    minYears,
    skills: skillFilter.split(",").map((skill) => skill.trim()).filter(Boolean),
    openOnly,
  });
  const applications = useCompanyApplications();
  const companyJobs = useCompanyJobs();
  const matches = useCandidateMatches(selectedJob);
  const items = candidates.data ?? [];
  const matchByEngineer = new Map((matches.data ?? []).map((match) => [match.engineer_id, match]));

  const handleInvite = (engineerId: string) => {
    if (!selectedJob) {
      toast.show("Please select a job above before inviting candidate", "error");
      return;
    }
    applications.invite.mutate(
      { jobId: selectedJob, engineerId },
      {
        onSuccess: () => toast.show("Invitation sent successfully!", "success"),
        onError: () => toast.show("Failed to send invitation.", "error"),
      }
    );
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="card-enterprise p-6 bg-gradient-to-r from-white via-indigo-50/20 to-white dark:from-slate-900 dark:to-slate-900 border-l-4 border-l-indigo-600 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="badge-ent badge-ent-brand text-[10px]">Talent Sourcing Engine</span>
            <span className="badge-ent badge-ent-success text-[10px]">AI Matching Active</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Candidate Discovery & Pipeline
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Source pre-vetted remote engineering talent, review applicants, and manage recruitment progression.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/jobs/new">
            <Button size="sm">Post New Role</Button>
          </Link>
        </div>
      </div>

      {/* Talent Search Filters */}
      <section className="card-enterprise p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-[#0A66C2]" /> Talent Filter Controls
          </h2>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills, role, or keyword"
            aria-label="Search talent"
            className="lg:col-span-2"
          />
          <Input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Primary role (e.g. Backend)"
            aria-label="Filter by role"
          />
          <Input
            value={minYears}
            onChange={(e) => setMinYears(e.target.value)}
            type="number"
            min={0}
            placeholder="Min years experience"
            aria-label="Minimum years of experience"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Input
            value={skillFilter}
            onChange={(e) => setSkillFilter(e.target.value)}
            placeholder="Skills (e.g. React, Python, Docker)"
            aria-label="Filter by skills"
          />
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
              className="rounded border-slate-300 text-[#0A66C2] focus:ring-[#0A66C2] h-4 w-4"
            />
            Open to work only
          </label>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center pt-2 border-t border-slate-100 dark:border-slate-800">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0" htmlFor="invite-job">
            Active Job for AI Match Ranking:
          </label>
          <Select
            id="invite-job"
            value={selectedJob}
            onChange={(e) => setSelectedJob(e.target.value)}
            className="max-w-md"
          >
            <option value="">Choose a job to see AI compatibility scores...</option>
            {(companyJobs.data ?? []).map((job: { id: string; title: string }) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </Select>
        </div>
      </section>

      {/* Application Review Section */}
      <section className="card-enterprise p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Active Applications In Review</h2>
            <p className="mt-0.5 text-xs text-slate-500">Move candidates through your hiring pipeline stages.</p>
          </div>
          <Badge tone="neutral">{applications.data?.length ?? 0} total applicants</Badge>
        </div>

        {applications.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : applications.isError ? (
          <p className="text-sm text-red-700">Unable to load applications.</p>
        ) : (applications.data ?? []).length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No applications yet"
            description="Applications will appear here once candidates apply to your open roles."
          />
        ) : (
          <div className="space-y-3">
            {(applications.data ?? []).map((item: { application: { id: string; status: string }; job: { title: string }; candidate: { full_name: string; headline?: string; skills?: string[] } }) => (
              <article
                key={item.application.id}
                className="rounded-xl border border-[var(--border-color)] p-4 hover:border-slate-300 transition-colors bg-[var(--bg-surface)]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Avatar name={item.candidate.full_name} size="md" />
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">{item.candidate.full_name}</p>
                      <p className="text-xs text-slate-500">
                        {item.candidate.headline || "Remote professional"} · Applied to{" "}
                        <strong className="text-slate-800 dark:text-slate-200">{item.job.title}</strong>
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(item.candidate.skills || []).slice(0, 5).map((skill) => (
                          <span key={skill} className="badge-ent badge-ent-neutral text-[10px]">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <StatusBadge
                    label={item.application.status}
                    tone={STATUS_TONE[item.application.status] ?? "neutral"}
                  />
                </div>

                {(reviewableStatuses[item.application.status] || []).length > 0 && (
                  <div className="mt-3.5 flex flex-wrap gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                    {reviewableStatuses[item.application.status].map((nextStatus) => (
                      <Button
                        key={nextStatus}
                        size="sm"
                        variant="secondary"
                        loading={applications.updateStatus.isPending}
                        onClick={() =>
                          applications.updateStatus.mutate({
                            applicationId: item.application.id,
                            status: nextStatus,
                          })
                        }
                      >
                        Move to {nextStatus.replace("_", " ")}
                      </Button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Talent Directory */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Talent Directory ({items.length})</h2>
            <p className="text-xs text-slate-500 mt-0.5">Explore public verified engineering talent ready for remote work.</p>
          </div>
          {selectedJob && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-[var(--color-ai)]" />
              Ranking by compatibility for selected position
            </span>
          )}
        </div>

        {candidates.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-xl" />
            ))}
          </div>
        ) : candidates.isError ? (
          <div className="card-enterprise p-6 text-center space-y-2">
            <p className="text-sm text-red-700">Unable to load candidates.</p>
            <Button size="sm" variant="secondary" onClick={() => candidates.refetch()}>
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="card-enterprise">
            <EmptyState
              icon={Users}
              title="No matching candidates"
              description="No public professional profiles match your filters. Try widening your search."
            />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((person: { id: string; headline?: string; primary_role?: string; years_of_experience?: number; skills?: string[]; location?: string; hourly_rate?: number }) => {
              const match = matchByEngineer.get(person.id);
              return (
                <article
                  key={person.id}
                  className="card-enterprise p-5 flex flex-col justify-between space-y-3 hover:border-slate-300 transition-colors"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <Avatar name={person.headline || person.primary_role || "Professional"} size="lg" />
                        <div>
                          <Link
                            href={`/engineers/${person.id}`}
                            className="font-bold text-slate-900 dark:text-white text-sm hover:text-[#0A66C2] transition-colors flex items-center gap-1"
                          >
                            {person.headline || person.primary_role || "Remote professional"}{" "}
                            <ExternalLink className="h-3 w-3 text-slate-400" />
                          </Link>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
                            <span>{person.years_of_experience ?? 0} yrs exp</span>
                            {person.location && (
                              <span className="flex items-center gap-0.5 text-[11px]">
                                <MapPin className="h-3 w-3" /> {person.location}
                              </span>
                            )}
                            {person.hourly_rate ? (
                              <span className="font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]">
                                ${person.hourly_rate}/hr
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {match && <MatchPill score={match.overall_score} />}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {(person.skills || []).slice(0, 6).map((skill) => (
                        <span key={skill} className="badge-ent badge-ent-neutral text-[10px]">
                          {skill}
                        </span>
                      ))}
                    </div>

                    {match && (
                      <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                        <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-500">
                          <span>
                            Skills <strong className="block text-slate-800 dark:text-slate-200">{Math.round(match.skill_score)}%</strong>
                          </span>
                          <span>
                            Experience <strong className="block text-slate-800 dark:text-slate-200">{Math.round(match.experience_score)}%</strong>
                          </span>
                          <span>
                            Role <strong className="block text-slate-800 dark:text-slate-200">{Math.round(match.role_score)}%</strong>
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-400">{match.reasoning}</p>
                        {match.missing_skills.length > 0 && (
                          <p className="mt-1 text-xs text-amber-700">Missing: {match.missing_skills.join(", ")}</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                    <Link
                      href={`/engineers/${person.id}`}
                      className="text-xs font-semibold text-[#0A66C2] hover:underline flex items-center gap-1"
                    >
                      View Profile <ArrowRight className="h-3 w-3" />
                    </Link>

                    {selectedJob && (
                      <Button
                        size="sm"
                        loading={applications.invite.isPending}
                        onClick={() => handleInvite(person.id)}
                      >
                        Invite to Role
                      </Button>
                    )}
                  </div>
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
  return (
    <RequireRole roles={["COMPANY", "ADMIN"]}>
      <CompanyCandidatesPageContent />
    </RequireRole>
  );
}
