"use client";

import Link from "next/link";
import {
  Briefcase, BarChart3, Globe, DollarSign, Zap, Sparkles,
  CheckCircle2, AlertTriangle, ArrowRight, TrendingUp,
} from "lucide-react";
import type { JobMatch } from "@/hooks/useRecommendations";

export function scoreColor(score: number): string {
  if (score >= 85) return "var(--color-success)";
  if (score >= 70) return "var(--color-ai)";
  if (score >= 55) return "var(--color-warning)";
  return "var(--color-danger)";
}

export function scoreGrade(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Strong";
  if (score >= 60) return "Good";
  if (score >= 45) return "Fair";
  return "Low";
}

const FACTORS: Array<{ key: keyof JobMatch; label: string; icon: React.ElementType }> = [
  { key: "skill_score", label: "Skills Alignment", icon: Briefcase },
  { key: "experience_score", label: "Experience Level", icon: BarChart3 },
  { key: "role_score", label: "Role & Seniority Fit", icon: Briefcase },
  { key: "timezone_score", label: "Timezone Compatibility", icon: Globe },
  { key: "compensation_score", label: "Target Compensation", icon: DollarSign },
  { key: "remote_score", label: "Remote Working Fit", icon: Zap },
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
        <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
          <Icon className="h-3 w-3 text-slate-400" />
          {label}
        </div>
        <span className="text-[11px] font-bold" style={{ color }}>{Math.round(value)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

/** Full Explainable AI match panel */
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
      <div className="card-enterprise p-5 text-center space-y-3">
        <span className="badge-ai inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs">
          <Sparkles className="h-3.5 w-3.5" /> Explainable AI Match
        </span>
        <p className="text-xs text-slate-500 pt-1 leading-relaxed">
          {emptyHint || "Complete your professional profile to see personalized compatibility explanations and skill gap analysis."}
        </p>
        <Link href="/engineer/profile" className="inline-flex items-center gap-1 text-xs font-semibold text-[#0866FF] hover:underline">
          Complete Profile Setup <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    );
  }

  return (
    <div className="card-enterprise p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="badge-ai inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold">
          <Sparkles className="h-3.5 w-3.5 text-[#7F56D9]" /> Explainable AI Match
        </span>
        <span className="text-[11px] font-semibold text-slate-400">Algorithmic Fit</span>
      </div>

      <div className="flex items-center gap-4">
        <ScoreRing score={match.overall_score} size={68} />
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">{scoreGrade(match.overall_score)} Match ({Math.round(match.overall_score)}%)</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Scored across 6 weighted compatibility factors</p>
        </div>
      </div>

      {match.reasoning && (
        <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
          <span className="font-semibold block mb-1 text-slate-900 dark:text-white flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-[#0866FF]" /> Why This Position Matches:
          </span>
          {match.reasoning}
        </div>
      )}

      {/* 6 Factors breakdown */}
      <div className="space-y-2.5 pt-1">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Factor Breakdown:</span>
        {FACTORS.map((f) => (
          <FactorBar key={f.key} label={f.label} value={match[f.key] as number} icon={f.icon} />
        ))}
      </div>

      {/* Matched & Missing Skills Explanations */}
      {(match.matching_skills.length > 0 || match.missing_skills.length > 0) && (
        <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          {match.matching_skills.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Strong Match Skills ({match.matching_skills.length}):
              </span>
              <div className="flex flex-wrap gap-1">
                {match.matching_skills.slice(0, 6).map((s) => (
                  <span key={s} className="badge-ent badge-ent-success text-[10px]">
                    ✓ {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {match.missing_skills.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Skill Gaps to Address:
              </span>
              <div className="flex flex-wrap gap-1">
                {match.missing_skills.slice(0, 4).map((s) => (
                  <span key={s} className="badge-ent badge-ent-warning text-[10px]">
                    + {s}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 pt-1">
                Tip: Adding these skills or related project deliverables to your profile will increase your match score.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
