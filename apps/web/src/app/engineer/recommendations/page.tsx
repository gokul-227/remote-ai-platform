"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sparkles, Briefcase, MapPin, DollarSign, CheckCircle, XCircle, Bookmark,
  ExternalLink, ChevronDown, ChevronUp, Star, RefreshCw, BarChart3, Globe,
} from "lucide-react";
import { useRecommendations, useUpdateMatchStatus, JobMatch } from "@/hooks/useRecommendations";
import { ScoreRing, scoreColor, scoreGrade } from "@/components/ai/MatchScore";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { RequireRole } from "@/components/RequireRole";

function fmtSalary(min?: number | null, max?: number | null, currency?: string | null) {
  if (!min && !max) return null;
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : (currency ?? "$");
  const fmt = (n: number) => (n >= 1000 ? `${sym}${(n / 1000).toFixed(0)}k` : `${sym}${n}`);
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `From ${fmt(min)}`;
  return `Up to ${fmt(max!)}`;
}

const REMOTE_LABEL: Record<string, string> = { full_remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

const FACTORS = [
  { key: "skill_score", label: "Skills" },
  { key: "experience_score", label: "Experience" },
  { key: "role_score", label: "Role Fit" },
  { key: "timezone_score", label: "Timezone" },
  { key: "compensation_score", label: "Compensation" },
  { key: "remote_score", label: "Remote Fit" },
] as const;

type Tier = "best" | "strong" | "potential" | "low";

function tierOf(score: number): Tier {
  if (score >= 85) return "best";
  if (score >= 70) return "strong";
  if (score >= 55) return "potential";
  return "low";
}

const TIER_META: Record<Tier, { title: string; description: string }> = {
  best: { title: "Best matches", description: "Excellent alignment across skills, experience, and fit." },
  strong: { title: "Strong matches", description: "Good alignment — worth a close look." },
  potential: { title: "Potential matches", description: "Fair alignment; a few gaps to weigh." },
  low: { title: "Needs improvement", description: "Low alignment right now — see what's missing." },
};

function MatchCard({ match, onSave, onDismiss, updating }: { match: JobMatch; onSave: () => void; onDismiss: () => void; updating: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const job = match.job;
  const salary = fmtSalary(job?.salary_min, job?.salary_max, job?.currency);
  const isSaved = match.status === "saved";
  const isDismissed = match.status === "dismissed";

  return (
    <div className={`card-enterprise p-4 space-y-3 ${isDismissed ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-4">
        <ScoreRing score={match.overall_score} size={64} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge tone={match.overall_score >= 70 ? "success" : match.overall_score >= 55 ? "warning" : "neutral"}>
              {scoreGrade(match.overall_score)} Match
            </Badge>
            {isSaved && <Badge tone="ai">Saved</Badge>}
          </div>
          <Link href={`/jobs/${match.job_id}`} className="font-semibold text-slate-900 text-sm hover:text-[#0A66C2] truncate block">
            {job?.title ?? "Unknown Position"}
          </Link>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
            <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{job?.company_name ?? "Company"}</span>
            {job?.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location}</span>}
            {salary && <span className="flex items-center gap-1 font-medium text-emerald-700"><DollarSign className="h-3 w-3" />{salary}</span>}
            {job?.remote_type && REMOTE_LABEL[job.remote_type] && (
              <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{REMOTE_LABEL[job.remote_type]}</span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 shrink-0">
          {job?.source_url && (
            <a href={job.source_url} target="_blank" rel="noreferrer">
              <Button size="sm" icon={<ExternalLink className="h-3.5 w-3.5" />}>Apply</Button>
            </a>
          )}
          <Button size="sm" variant={isSaved ? "secondary" : "ghost"} onClick={onSave} disabled={updating} icon={<Bookmark className="h-3.5 w-3.5" />}>
            {isSaved ? "Saved" : "Save"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss} disabled={updating || isDismissed} icon={<XCircle className="h-3.5 w-3.5" />}>
            Hide
          </Button>
        </div>
      </div>

      {(match.matching_skills.length > 0 || match.missing_skills.length > 0) && (
        <div className="flex flex-wrap gap-1.5 pl-[80px]">
          {match.matching_skills.slice(0, 6).map((s) => (
            <Badge key={s} tone="success"><CheckCircle className="h-3 w-3" />{s}</Badge>
          ))}
          {match.missing_skills.slice(0, 3).map((s) => (
            <Badge key={s} tone="danger"><XCircle className="h-3 w-3" />{s}</Badge>
          ))}
        </div>
      )}

      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 pl-[80px]"
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {expanded ? "Hide breakdown" : "Why this matches you"}
      </button>

      {expanded && (
        <div className="grid sm:grid-cols-2 gap-5 pl-[80px] pt-2 border-t border-slate-100">
          <div className="space-y-2.5">
            <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Score breakdown</h4>
            {FACTORS.map((f) => (
              <div key={f.key}>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                  <span>{f.label}</span>
                  <span className="font-bold" style={{ color: scoreColor(match[f.key]) }}>{Math.round(match[f.key])}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${match[f.key]}%`, background: scoreColor(match[f.key]) }} />
                </div>
              </div>
            ))}
          </div>
          <div>
            <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">AI reasoning</h4>
            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-100 rounded-lg p-3 italic">
              {match.reasoning}
            </p>
            {match.missing_skills.length > 0 && (
              <Link href="/engineer/profile" className="text-xs font-semibold text-[#0A66C2] hover:underline mt-2 inline-block">
                Improve my match →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RecommendationsPage() {
  return (
    <RequireRole roles={["ENGINEER"]}>
      <RecommendationsContent />
    </RequireRole>
  );
}

function RecommendationsContent() {
  const { data: matches, isLoading, isError, refetch, isFetching } = useRecommendations(30);
  const updateStatus = useUpdateMatchStatus();
  const [filter, setFilter] = useState<"all" | "active" | "saved">("all");

  const allMatches = matches ?? [];
  const filtered = allMatches.filter((m) => {
    if (filter === "saved") return m.status === "saved";
    if (filter === "active") return m.status !== "dismissed";
    return true;
  });

  const avgScore = allMatches.length ? Math.round(allMatches.reduce((acc, m) => acc + m.overall_score, 0) / allMatches.length) : 0;
  const topMatch = allMatches.reduce<JobMatch | null>((best, m) => (!best || m.overall_score > best.overall_score ? m : best), null);

  const groups: Record<Tier, JobMatch[]> = { best: [], strong: [], potential: [], low: [] };
  for (const m of filtered) groups[tierOf(m.overall_score)].push(m);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--color-ai)]" /> AI Matches
          </h1>
          <p className="text-xs text-slate-500 mt-1">Personalized matches scored across 6 compatibility factors.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => refetch()} loading={isFetching} icon={!isFetching ? <RefreshCw className="h-3.5 w-3.5" /> : undefined}>
          Refresh
        </Button>
      </div>

      {!isLoading && allMatches.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Matches", value: allMatches.length, icon: BarChart3 },
            { label: "Avg Match Score", value: `${avgScore}%`, icon: Star },
            { label: "Saved", value: allMatches.filter((m) => m.status === "saved").length, icon: Bookmark },
            { label: "Top Score", value: topMatch ? `${Math.round(topMatch.overall_score)}%` : "—", icon: Sparkles },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="card-enterprise p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-[var(--color-ai-soft)] flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-[var(--color-ai)]" />
              </div>
              <div>
                <div className="text-lg font-bold text-slate-900 leading-none">{value}</div>
                <div className="text-[11px] text-slate-500 mt-1">{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Tabs
        items={[
          { key: "all", label: "All", count: allMatches.length },
          { key: "active", label: "Active", count: allMatches.filter((m) => m.status !== "dismissed").length },
          { key: "saved", label: "Saved", count: allMatches.filter((m) => m.status === "saved").length },
        ]}
        active={filter}
        onChange={(k) => setFilter(k as typeof filter)}
      />

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      )}

      {isError && (
        <div className="card-enterprise">
          <EmptyState
            icon={XCircle}
            title="Unable to load recommendations"
            description="Complete your engineer profile to unlock AI job matching."
            actionLabel="Complete profile"
            actionHref="/engineer/profile"
          />
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="card-enterprise">
          <EmptyState
            icon={Sparkles}
            title={filter === "saved" ? "No saved matches yet" : "No recommendations found"}
            description={filter === "saved" ? "Browse matches and save the ones you like." : "Complete your engineer profile to get personalized AI recommendations."}
            actionLabel="Complete profile"
            actionHref="/engineer/profile"
          />
        </div>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="space-y-6">
          {(["best", "strong", "potential", "low"] as Tier[]).map((tier) =>
            groups[tier].length > 0 ? (
              <div key={tier} className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">{TIER_META[tier].title}</h2>
                  <p className="text-xs text-slate-500">{TIER_META[tier].description}</p>
                </div>
                {groups[tier].map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    onSave={() => updateStatus.mutate({ matchId: match.id, status: match.status === "saved" ? "recommended" : "saved" })}
                    onDismiss={() => updateStatus.mutate({ matchId: match.id, status: "dismissed" })}
                    updating={updateStatus.isPending}
                  />
                ))}
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
