import { useState } from "react";
import { Av, Btn, Card, Tag, Notice, inputCls } from "./rap_kit";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { goRoute, useApi, uniqueSkills } from "./live";

/* Talent matching: rank professionals against one of your job postings.
   Scores come from the matching engine (/matching/candidates/{job}); each
   candidate shows the overall score, the factors behind it and the skills
   they have or are missing, so the ranking is explainable. */

interface Posting {
  id: string;
  title: string;
  status?: string;
  location?: string | null;
}
interface Candidate {
  id: string;
  overall_score: number;
  skill_score: number;
  experience_score: number;
  role_score: number;
  timezone_score: number;
  availability_score: number;
  compensation_score: number;
  remote_score: number;
  reasoning: string;
  matching_skills: string[];
  missing_skills: string[];
  engineer?: {
    id: string;
    user_id: string;
    full_name?: string | null;
    headline?: string | null;
    primary_role?: string | null;
    location?: string | null;
    years_of_experience?: number;
    availability?: string | null;
  } | null;
}

const FACTORS: [keyof Candidate, string][] = [
  ["skill_score", "Skills"],
  ["experience_score", "Experience"],
  ["role_score", "Role fit"],
  ["timezone_score", "Time zone"],
  ["availability_score", "Availability"],
  ["compensation_score", "Compensation"],
  ["remote_score", "Remote fit"],
];
const pct = (v: number) => Math.round(v <= 1 ? v * 100 : v);

export function TalentMatching() {
  const { user } = useAuth();
  const postings = useApi<Posting[]>(user ? "/jobs/company" : null, { limit: 100 });
  const [jobId, setJobId] = useState("");
  const selected = jobId || postings.data?.[0]?.id || "";
  const matches = useApi<Candidate[]>(selected ? `/matching/candidates/${selected}` : null, { limit: 25 });
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const message = async (c: Candidate) => {
    if (!c.engineer) return;
    try {
      await api.post("/conversations", { participant_id: c.engineer.user_id });
      sessionStorage.setItem("rap-contact-id", c.engineer.user_id);
      goRoute("messenger");
    } catch (e) {
      setNotice(extractErrorMessage(e, "Couldn’t start a conversation."));
    }
  };
  const rows = matches.data ?? [];
  return (
    <div className="v2-page">
      <header className="v2-page-head">
        <div>
          <h1>Talent matching</h1>
          <p>
            Professionals ranked against your job posting by skills, experience, role, time zone, availability,
            compensation and remote fit.
          </p>
        </div>
        <Btn icon="plus" onClick={() => goRoute("postjob")}>
          Post a job
        </Btn>
      </header>
      {postings.loading && !postings.data ? (
        <p className="text-slate-500">Loading your postings…</p>
      ) : !postings.data?.length ? (
        <Card c="rounded-xl p-8 text-center">
          <h2 className="text-lg font-bold">Post a job to see matched talent</h2>
          <p className="mt-2 text-sm text-slate-500">
            Matching ranks professionals against a specific role. Create a posting and the best fits appear here.
          </p>
          <Btn c="mt-4" onClick={() => goRoute("postjob")}>
            Post a job
          </Btn>
        </Card>
      ) : (
        <>
          <div className="v2-toolbar">
            <label className="text-sm font-semibold" htmlFor="tm-job">
              Job posting
            </label>
            <select
              id="tm-job"
              className={`${inputCls} max-w-md`}
              value={selected}
              onChange={(e) => setJobId(e.target.value)}
            >
              {postings.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {p.status && p.status !== "ACTIVE" ? ` (${p.status.toLowerCase()})` : ""}
                </option>
              ))}
            </select>
            <span className="text-sm text-slate-500">{rows.length ? `${rows.length} candidates` : ""}</span>
          </div>
          {matches.loading && !matches.data ? (
            <p className="text-slate-500">Ranking candidates…</p>
          ) : matches.error && !matches.data ? (
            <Card c="rounded-xl p-6">
              <p className="text-sm text-slate-600">Matches aren’t available for this posting right now.</p>
              <Btn v="outline" sm c="mt-3" onClick={matches.reload}>
                Try again
              </Btn>
            </Card>
          ) : !rows.length ? (
            <Card c="rounded-xl p-8 text-center">
              <h2 className="text-lg font-bold">No matches yet</h2>
              <p className="mt-2 text-sm text-slate-500">
                Add required skills to the posting, or check back as more professionals complete their profiles.
              </p>
            </Card>
          ) : (
            <div className="v2-list">
              {rows.map((c, i) => {
                const e = c.engineer;
                const name = e?.full_name || "Professional";
                const expanded = open === c.id;
                return (
                  <div key={c.id} className="v2-row" style={{ alignItems: "flex-start" }}>
                    <span className="w-6 pt-3 text-sm font-semibold text-slate-400">{i + 1}</span>
                    <Av name={name} s={52} />
                    <div className="v2-row-main">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          className="font-bold hover:underline"
                          onClick={() => e && goRoute(`engineer/${encodeURIComponent(e.id)}`)}
                        >
                          {name}
                        </button>
                        <Tag t="blue">{pct(c.overall_score)}% match</Tag>
                      </div>
                      <p>
                        {[
                          e?.headline || e?.primary_role,
                          e?.location,
                          e?.years_of_experience ? `${e.years_of_experience} yrs` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {!!c.matching_skills.length && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {uniqueSkills(c.matching_skills)
                            .slice(0, 8)
                            .map((s) => (
                              <Tag key={s} t="green">
                                {s}
                              </Tag>
                            ))}
                          {uniqueSkills(c.missing_skills)
                            .slice(0, 4)
                            .map((s) => (
                              <Tag key={s} t="gray">
                                Missing: {s}
                              </Tag>
                            ))}
                        </div>
                      )}
                      {expanded && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {FACTORS.map(([k, label]) => (
                            <div key={k} className="text-xs">
                              <div className="flex justify-between text-slate-500">
                                <span>{label}</span>
                                <span>{pct(c[k] as number)}%</span>
                              </div>
                              <div className="mt-1 h-1.5 rounded bg-slate-100">
                                <div
                                  className="h-1.5 rounded bg-[#0552CC]"
                                  style={{ width: `${Math.min(100, pct(c[k] as number))}%` }}
                                />
                              </div>
                            </div>
                          ))}
                          {c.reasoning && <p className="text-sm text-slate-600 sm:col-span-2">{c.reasoning}</p>}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <Btn sm v="outline" onClick={() => setOpen(expanded ? null : c.id)}>
                        {expanded ? "Hide breakdown" : "Why this match"}
                      </Btn>
                      <Btn sm icon="chat" onClick={() => message(c)}>
                        Message
                      </Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      <Notice text={notice} onDismiss={() => setNotice("")} />
    </div>
  );
}
