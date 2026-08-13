"use client";

import { Briefcase, BarChart3, Globe, DollarSign, Zap, Sparkles } from "lucide-react";
import type { JobMatch } from "@/hooks/useRecommendations";

/**
 * One reusable AI match visualization — used on the job detail page
 * (engineer → job) and intended for reuse on candidate-facing surfaces
 * (company → candidate) rather than each screen re-implementing its own
 * score ring/factor bars. Light-themed to match the rest of the app; see
 * engineer/recommendations/page.tsx for a still-unreconciled dark-themed
 * version of the same idea — that page's local ScoreRing/FactorBar should
 * eventually be replaced with this component (tracked as a Phase 9 item),
 * not duplicated further.
 */

export function scoreColor(score: number): string {
  if (score >= 85) return "var(--color-success)";
  if (score >= 70) return "var(--color-ai)";
  if (score >= 55) return "var(--color-warning)";
  return "var(--color-danger)";
}

export function scoreGrade(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  return "Low";
}

const FACTORS: Array<{ key: keyof JobMatch; label: string; icon: React.ElementType }> = [
  { key: "skill_score", label: "Skills", icon: Briefcase },
  { key: "experience_score", label: "Experience", icon: BarChart3 },
  { key: "role_score", label: "Role Fit", icon: Briefcase },
  { key: "timezone_score", label: "Timezone", icon: Globe },
  { key: "compensation_score", label: "Compensation", icon: DollarSign },
  { key: "remote_score", label: "Remote Fit", icon: Zap },
];

export function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = scoreColor(score);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-color)" strokeWidth={7} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={7}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.25, fontWeight: 800, color, lineHeight: 1 }}>{Math.round(score)}</span>
        <span className="text-slate-400" style={{ fontSize: size * 0.13, marginTop: 1 }}>/ 100</span>
      </div>
    </div>
  );
}

function FactorBar({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  const color = scoreColor(value);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <Icon className="h-3 w-3 text-slate-400" />
          {label}
        </div>
        <span className="text-[11px] font-bold" style={{ color }}>{Math.round(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

/** Full AI match panel — score ring, grade, why-this-matches reasoning, matched/missing skills, 6-factor breakdown. */
export function AIMatchPanel({ match, loading, emptyHint }: { match: JobMatch | null | undefined; loading?: boolean; emptyHint?: string }) {
  if (loading) {
    return (
      <div className="card-enterprise p-5 space-y-4">
        <div className="skeleton-box h-4 w-24" />
        <div className="flex items-center gap-4">
          <div className="skeleton-box h-16 w-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton-box h-3 w-full" />
            <div className="skeleton-box h-3 w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="card-enterprise p-5 text-center space-y-2">
        <span className="badge-ai"><Sparkles className="h-3 w-3" /> AI Match</span>
        <p className="text-xs text-slate-500 pt-1">
          {emptyHint || "Complete your engineer profile to see your AI match score for this role."}
        </p>
      </div>
    );
  }

  return (
    <div className="card-enterprise p-5 space-y-4">
      <span className="badge-ai"><Sparkles className="h-3 w-3" /> AI Match</span>

      <div className="flex items-center gap-4">
        <ScoreRing score={match.overall_score} size={68} />
        <div>
          <p className="text-sm font-bold text-slate-900">{scoreGrade(match.overall_score)} Match</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Based on 6 compatibility factors</p>
        </div>
      </div>

      {match.reasoning && (
        <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-100 rounded-lg p-3">
          {match.reasoning}
        </div>
      )}

      <div className="space-y-3 pt-1">
        {FACTORS.map((f) => (
          <FactorBar key={f.key} label={f.label} value={match[f.key] as number} icon={f.icon} />
        ))}
      </div>

      {(match.matching_skills.length > 0 || match.missing_skills.length > 0) && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          {match.matching_skills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {match.matching_skills.slice(0, 6).map((s) => (
                <span key={s} className="badge-ent badge-ent-success">{s}</span>
              ))}
            </div>
          )}
          {match.missing_skills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {match.missing_skills.slice(0, 4).map((s) => (
                <span key={s} className="badge-ent badge-ent-warning">{s}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
