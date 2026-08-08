"use client";

import { useState } from "react";
import {
  Sparkles,
  Briefcase,
  MapPin,
  DollarSign,
  CheckCircle,
  XCircle,
  Bookmark,
  ExternalLink,
  Brain,
  Zap,
  Globe,
  Clock,
  Users,
  Code,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Star,
  RefreshCw,
} from "lucide-react";
import { useRecommendations, useUpdateMatchStatus, JobMatch } from "@/hooks/useRecommendations";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtSalary(min?: number | null, max?: number | null, currency?: string | null) {
  if (!min && !max) return null;
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : (currency ?? "$");
  const fmt = (n: number) => n >= 1000 ? `${sym}${(n / 1000).toFixed(0)}k` : `${sym}${n}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `From ${fmt(min)}`;
  return `Up to ${fmt(max!)}`;
}

function scoreColor(score: number) {
  if (score >= 85) return "#34d399";
  if (score >= 70) return "#a78bfa";
  if (score >= 55) return "#facc15";
  return "#f87171";
}

function scoreGrade(score: number) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  return "Low";
}

const REMOTE_BADGES: Record<string, { label: string; color: string }> = {
  full_remote: { label: "Remote", color: "#34d399" },
  hybrid: { label: "Hybrid", color: "#38bdf8" },
  onsite: { label: "On-site", color: "#f472b6" },
};

// ── Score Ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = scoreColor(score);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={7} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={7}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.25, fontWeight: 900, color, lineHeight: 1 }}>{Math.round(score)}</span>
        <span style={{ fontSize: size * 0.13, color: "#64748b", marginTop: 1 }}>/ 100</span>
      </div>
    </div>
  );
}

// ── Factor Bar ────────────────────────────────────────────────────────────────
function FactorBar({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  const color = scoreColor(value);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#94a3b8" }}>
          <Icon size={12} color="#64748b" />
          {label}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{Math.round(value)}</span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 4, transition: "width 0.8s ease" }} />
      </div>
    </div>
  );
}

const FACTORS = [
  { key: "skill_score", label: "Skills", icon: Code },
  { key: "experience_score", label: "Experience", icon: BarChart3 },
  { key: "role_score", label: "Role Fit", icon: Briefcase },
  { key: "timezone_score", label: "Timezone", icon: Globe },
  { key: "compensation_score", label: "Compensation", icon: DollarSign },
  { key: "remote_score", label: "Remote Fit", icon: Zap },
] as const;

// ── Job Match Card ────────────────────────────────────────────────────────────
function JobMatchCard({
  match,
  onSave,
  onDismiss,
  updating,
}: {
  match: JobMatch;
  onSave: () => void;
  onDismiss: () => void;
  updating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const job = match.job;
  const color = scoreColor(match.overall_score);
  const salary = fmtSalary(job?.salary_min, job?.salary_max, job?.currency);
  const remoteBadge = job?.remote_type ? REMOTE_BADGES[job.remote_type] : null;

  const isSaved = match.status === "saved";
  const isDismissed = match.status === "dismissed";

  return (
    <div
      style={{
        background: isDismissed ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${isDismissed ? "rgba(255,255,255,0.04)" : `${color}22`}`,
        borderRadius: 18,
        overflow: "hidden",
        opacity: isDismissed ? 0.5 : 1,
        transition: "all 0.2s",
      }}
      className="match-card"
    >
      {/* Main content */}
      <div style={{ padding: "20px 22px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <ScoreRing score={match.overall_score} size={68} />

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Score grade badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                color, background: `${color}18`,
                padding: "2px 8px", borderRadius: 20,
                border: `1px solid ${color}33`,
              }}>
                {scoreGrade(match.overall_score)} Match
              </span>
              {isSaved && (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#a78bfa", background: "rgba(167,139,250,0.1)", padding: "2px 8px", borderRadius: 20 }}>
                  Saved
                </span>
              )}
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9", margin: "0 0 4px", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {job?.title ?? "Unknown Position"}
            </h3>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12, color: "#64748b" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Briefcase size={11} />{job?.company_name ?? "Company"}
              </span>
              {job?.location && (
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <MapPin size={11} />{job.location}
                </span>
              )}
              {salary && (
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <DollarSign size={11} />{salary}
                </span>
              )}
              {remoteBadge && (
                <span style={{ color: remoteBadge.color, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                  <Globe size={11} />{remoteBadge.label}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
            {job?.source_url && (
              <a
                href={job.source_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "7px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  textDecoration: "none",
                  boxShadow: "0 3px 12px rgba(124,58,237,0.3)",
                }}
              >
                <ExternalLink size={12} />
                Apply
              </a>
            )}
            <button
              onClick={onSave}
              disabled={updating}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 12px",
                borderRadius: 8,
                border: `1px solid ${isSaved ? "rgba(167,139,250,0.4)" : "rgba(255,255,255,0.1)"}`,
                background: isSaved ? "rgba(167,139,250,0.12)" : "transparent",
                color: isSaved ? "#a78bfa" : "#64748b",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <Bookmark size={12} />
              {isSaved ? "Saved" : "Save"}
            </button>
            <button
              onClick={onDismiss}
              disabled={updating || isDismissed}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.06)",
                background: "transparent",
                color: "#334155",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <XCircle size={12} />
              Hide
            </button>
          </div>
        </div>

        {/* Skills */}
        {(match.matching_skills.length > 0 || match.missing_skills.length > 0) && (
          <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 5 }}>
            {match.matching_skills.slice(0, 6).map((skill) => (
              <span key={skill} style={{
                fontSize: 11, padding: "3px 8px", borderRadius: 6,
                background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)",
                color: "#34d399", display: "flex", alignItems: "center", gap: 3,
              }}>
                <CheckCircle size={10} />{skill}
              </span>
            ))}
            {match.missing_skills.slice(0, 3).map((skill) => (
              <span key={skill} style={{
                fontSize: 11, padding: "3px 8px", borderRadius: 6,
                background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.15)",
                color: "#f87171", display: "flex", alignItems: "center", gap: 3,
              }}>
                <XCircle size={10} />{skill}
              </span>
            ))}
          </div>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            marginTop: 12,
            background: "none",
            border: "none",
            color: "#475569",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? "Hide breakdown" : "View AI score breakdown"}
        </button>
      </div>

      {/* Expanded: factor scores + reasoning */}
      {expanded && (
        <div style={{
          padding: "0 22px 20px",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          paddingTop: 16,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: "#64748b", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Score Breakdown
            </h4>
            {FACTORS.map(({ key, label, icon }) => (
              <FactorBar key={key} label={label} value={match[key]} icon={icon} />
            ))}
          </div>
          <div>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: "#64748b", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              AI Reasoning
            </h4>
            <div style={{
              background: "rgba(167,139,250,0.05)",
              border: "1px solid rgba(167,139,250,0.12)",
              borderRadius: 10,
              padding: "12px 14px",
              fontSize: 12,
              color: "#94a3b8",
              lineHeight: 1.7,
              fontStyle: "italic",
            }}>
              {match.reasoning}
            </div>
            {job?.description && (
              <div style={{ marginTop: 12 }}>
                <h4 style={{ fontSize: 12, fontWeight: 700, color: "#64748b", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Job Description
                </h4>
                <p style={{ fontSize: 12, color: "#64748b", margin: 0, lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {job.description}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RecommendationsPage() {
  const { data: matches, isLoading, isError, refetch, isFetching } = useRecommendations(30);
  const updateStatus = useUpdateMatchStatus();
  const [filter, setFilter] = useState<"all" | "saved" | "active">("all");

  const allMatches = matches ?? [];

  const filtered = allMatches.filter((m) => {
    if (filter === "saved") return m.status === "saved";
    if (filter === "active") return m.status !== "dismissed";
    return true;
  });

  const avgScore = allMatches.length
    ? Math.round(allMatches.reduce((acc, m) => acc + m.overall_score, 0) / allMatches.length)
    : 0;

  const topMatch = allMatches.reduce<JobMatch | null>((best, m) =>
    !best || m.overall_score > best.overall_score ? m : best, null
  );

  return (
    <>
      <style>{`
        .match-card:hover {
          border-color: rgba(167,139,250,0.2) !important;
          background: rgba(255,255,255,0.04) !important;
        }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#080e1c", fontFamily: "'Inter', system-ui, sans-serif", color: "#e2e8f0" }}>
        {/* Header */}
        <div style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.02)",
          padding: "24px 32px",
        }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
                  }}>
                    <Brain size={20} color="#fff" />
                  </div>
                  <div>
                    <h1 style={{ fontSize: 26, fontWeight: 900, color: "#f1f5f9", margin: 0, letterSpacing: "-0.02em" }}>
                      AI Job Recommendations
                    </h1>
                    <p style={{ fontSize: 13, color: "#475569", margin: 0 }}>
                      Personalized matches scored across 6 compatibility factors
                    </p>
                  </div>
                </div>
              </div>
              <button
                id="refresh-recommendations-btn"
                onClick={() => refetch()}
                disabled={isFetching}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "9px 16px",
                  borderRadius: 10,
                  border: "1px solid rgba(167,139,250,0.3)",
                  background: "rgba(167,139,250,0.08)",
                  color: "#a78bfa",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: isFetching ? 0.6 : 1,
                  transition: "all 0.2s",
                  flexShrink: 0,
                }}
              >
                <RefreshCw size={14} style={{ animation: isFetching ? "spin 1s linear infinite" : "none" }} />
                Refresh
              </button>
            </div>

            {/* Stats */}
            {!isLoading && allMatches.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Total Matches", value: allMatches.length, icon: BarChart3, color: "#a78bfa" },
                  { label: "Avg Match Score", value: `${avgScore}%`, icon: Star, color: "#facc15" },
                  { label: "Saved", value: allMatches.filter((m) => m.status === "saved").length, icon: Bookmark, color: "#34d399" },
                  { label: "Top Score", value: topMatch ? `${Math.round(topMatch.overall_score)}%` : "—", icon: Sparkles, color: "#38bdf8" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 12,
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon size={16} color={color} />
                    </div>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#f1f5f9", lineHeight: 1 }}>{value}</div>
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{label}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Filters */}
            <div style={{ display: "flex", gap: 0 }}>
              {(["all", "active", "saved"] as const).map((f) => {
                const counts = { all: allMatches.length, active: allMatches.filter((m) => m.status !== "dismissed").length, saved: allMatches.filter((m) => m.status === "saved").length };
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      padding: "10px 16px",
                      background: "none",
                      border: "none",
                      borderBottom: filter === f ? "2px solid #a78bfa" : "2px solid transparent",
                      color: filter === f ? "#a78bfa" : "#475569",
                      fontSize: 13,
                      fontWeight: filter === f ? 700 : 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      textTransform: "capitalize",
                    }}
                  >
                    {f} <span style={{ fontSize: 10, background: filter === f ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.05)", color: filter === f ? "#a78bfa" : "#475569", borderRadius: 20, padding: "1px 6px", fontWeight: 700 }}>{counts[f]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 32px" }}>
          {isLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ height: 120, borderRadius: 18, background: "rgba(255,255,255,0.02)", animation: "pulse 2s infinite" }} />
              ))}
            </div>
          )}

          {isError && (
            <div style={{
              textAlign: "center",
              padding: "64px 24px",
              background: "rgba(248,113,113,0.04)",
              border: "1px solid rgba(248,113,113,0.15)",
              borderRadius: 16,
            }}>
              <XCircle size={40} color="#ef4444" style={{ marginBottom: 14 }} />
              <h3 style={{ fontSize: 18, color: "#f87171", margin: "0 0 8px" }}>
                Unable to load recommendations
              </h3>
              <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px" }}>
                Complete your engineer profile to unlock AI job matching
              </p>
              <button onClick={() => refetch()} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Retry
              </button>
            </div>
          )}

          {!isLoading && !isError && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "64px 24px", color: "#334155" }}>
              <Sparkles size={44} color="#1e293b" style={{ marginBottom: 14 }} />
              <h3 style={{ fontSize: 18, color: "#475569", margin: "0 0 8px" }}>
                {filter === "saved" ? "No saved matches yet" : "No recommendations found"}
              </h3>
              <p style={{ fontSize: 13, margin: "0 0 20px" }}>
                {filter === "saved"
                  ? "Browse matches and save the ones you like"
                  : "Complete your engineer profile to get personalized AI recommendations"}
              </p>
            </div>
          )}

          {!isLoading && !isError && filtered.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {filtered.map((match) => (
                <JobMatchCard
                  key={match.id}
                  match={match}
                  onSave={() => updateStatus.mutate({ matchId: match.id, status: match.status === "saved" ? "recommended" : "saved" })}
                  onDismiss={() => updateStatus.mutate({ matchId: match.id, status: "dismissed" })}
                  updating={updateStatus.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </>
  );
}
