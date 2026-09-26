"use client";

import Link from "next/link";
import { useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { useRecommendations, useUpdateMatchStatus } from "@/hooks/useRecommendations";
import { useSavedJobs } from "@/hooks/useSavedJobs";
import { Btn, Card, Empty, ErrorState, Lg, Loading, Page, Tabs, Tag } from "@/components/rap/kit";
import { formatPay } from "@/lib/format";

const TABS = ["All", "Contract", "Full-time"] as const;
type Tab = (typeof TABS)[number];
const kind = (t?: string | null) => (t || "").toLowerCase();

export default function RecommendationsPage() {
  return <RequireRole roles={["ENGINEER"]}><Recs /></RequireRole>;
}

function Recs() {
  const [tab, setTab] = useState<Tab>("All");
  const matches = useRecommendations(50);
  const saved = useSavedJobs();
  const dismiss = useUpdateMatchStatus();
  const savedIds = new Set((saved.data ?? []).map((j) => j.id));

  const all = (matches.data ?? []).filter((m) => m.job && m.status !== "dismissed");
  const inTab = (t: Tab) => all.filter((m) => t === "All" || (t === "Contract" ? ["contract", "freelance"].includes(kind(m.job?.job_type)) : kind(m.job?.job_type) === "full-time"));
  const rows = inTab(tab);
  const counts = { All: all.length, Contract: inTab("Contract").length, "Full-time": inTab("Full-time").length };

  return (
    <Page title="Matches for you" sub="Compare your skills, experience, role, timezone, availability, rate and remote preferences.">
      <Tabs items={TABS} v={tab} set={setTab} counts={counts} />
      <div className="mt-5 space-y-4">
        {matches.isLoading ? <Loading label="Finding your best matches…" /> : matches.isError ? <ErrorState onRetry={() => matches.refetch()} /> : !rows.length ? (
          <Card><Empty icon="target" title={all.length ? "No matches for this filter" : "No matches yet"} action={<Btn href={all.length ? "/jobs" : "/onboarding"}>{all.length ? "Explore jobs" : "Complete my profile"}</Btn>}>
            {all.length ? "Try another filter or explore all open roles." : "Add your skills and preferences — we recalculate matches as new jobs arrive."}
          </Empty></Card>
        ) : rows.map((m) => {
          const j = m.job!;
          const isSaved = savedIds.has(j.id);
          return (
            <Card key={m.id}>
              <div className="flex items-start gap-4">
                <Lg name={j.company_name || j.title} src={j.company_logo} />
                <div className="min-w-0 flex-1">
                  <Link href={`/jobs/${j.id}`} className="text-left text-lg font-bold text-[#0757d8] hover:underline">{j.title}</Link>
                  <p className="mt-1 text-sm text-slate-500">{[j.company_name, j.location || "Remote", formatPay(j)].filter(Boolean).join(" · ")}</p>
                </div>
                <Tag t="blue">{Math.round(m.overall_score)}% match</Tag>
              </div>
              <p className="my-4 text-sm text-slate-600">{m.reasoning || "Review the complete requirements before applying."}</p>
              {(!!m.matching_skills.length || !!m.missing_skills.length) && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {m.matching_skills.slice(0, 6).map((s) => <Tag key={s} t="green">{s}</Tag>)}
                  {m.missing_skills.slice(0, 4).map((s) => <Tag key={s} t="amber">Gap: {s}</Tag>)}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Btn href={`/jobs/${j.id}`}>View match & apply</Btn>
                <Btn v="gray" icon="bookmark" loading={saved.save.isPending && saved.save.variables === j.id} onClick={() => (isSaved ? saved.remove : saved.save).mutate(j.id)}>{isSaved ? "Saved" : "Save job"}</Btn>
                <Btn v="ghost" loading={dismiss.isPending && dismiss.variables?.matchId === m.id} onClick={() => dismiss.mutate({ matchId: m.id, status: "dismissed" })}>Not interested</Btn>
              </div>
            </Card>
          );
        })}
      </div>
    </Page>
  );
}
