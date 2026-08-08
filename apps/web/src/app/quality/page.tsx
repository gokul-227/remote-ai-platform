"use client";

import { useState } from "react";
import {
  Sparkles,
  Code2,
  FileCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  ChevronDown,
  ChevronRight,
  Star,
  Shield,
  Zap,
  BookOpen,
  Activity,
  Send,
  RotateCcw,
  BarChart3,
} from "lucide-react";
import {
  useEvaluateSubmission,
  useCodeReview,
  SubmissionQualityReport,
  CodeReviewReport,
} from "@/hooks/useQuality";

// ── Helpers ───────────────────────────────────────────────────────────────────
const VERDICT_CONFIG = {
  approved: { label: "Approved", color: "#34d399", bg: "rgba(52,211,153,0.1)", icon: CheckCircle },
  approved_with_notes: { label: "Approved with Notes", color: "#facc15", bg: "rgba(250,204,21,0.1)", icon: Info },
  revision_required: { label: "Revision Required", color: "#fb923c", bg: "rgba(251,146,60,0.1)", icon: AlertTriangle },
  rejected: { label: "Rejected", color: "#f87171", bg: "rgba(248,113,113,0.1)", icon: XCircle },
};

const SEVERITY_CONFIG = {
  critical: { color: "#f87171", bg: "rgba(248,113,113,0.1)", icon: XCircle },
  warning: { color: "#fb923c", bg: "rgba(251,146,60,0.1)", icon: AlertTriangle },
  info: { color: "#60a5fa", bg: "rgba(96,165,250,0.1)", icon: Info },
};

const DIMENSION_ICONS: Record<string, React.ElementType> = {
  completeness: FileCheck,
  code_quality: Code2,
  documentation: BookOpen,
  testing: Activity,
  security: Shield,
  performance: Zap,
};

function ScoreRing({ score, size = 100 }: { score: number; size?: number }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference - (score / 100) * circumference;
  const color = score >= 90 ? "#34d399" : score >= 75 ? "#a78bfa" : score >= 60 ? "#facc15" : "#f87171";

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={8}
          strokeDasharray={circumference}
          strokeDashoffset={progress}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: size * 0.26, fontWeight: 900, color, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: size * 0.11, color: "#64748b", marginTop: 2 }}>/ 100</span>
      </div>
    </div>
  );
}

function GradeBadge({ grade }: { grade: string }) {
  const colors: Record<string, string> = {
    "A+": "#34d399", "A": "#34d399", "A-": "#4ade80",
    "B+": "#a78bfa", "B": "#a78bfa", "B-": "#818cf8",
    "C+": "#facc15", "C": "#facc15",
    "D": "#fb923c",
    "F": "#f87171",
  };
  const color = colors[grade] ?? "#94a3b8";
  return (
    <div style={{
      padding: "4px 12px",
      borderRadius: 8,
      background: `${color}22`,
      border: `1px solid ${color}44`,
      color,
      fontSize: 18,
      fontWeight: 900,
    }}>
      {grade}
    </div>
  );
}

// ── Submission Evaluator ──────────────────────────────────────────────────────
function SubmissionEvaluator() {
  const evaluate = useEvaluateSubmission();
  const [form, setForm] = useState({
    task_title: "",
    task_description: "",
    submission_content: "",
    requirements: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    evaluate.mutate({
      task_title: form.task_title,
      task_description: form.task_description,
      submission_content: form.submission_content,
      requirements: form.requirements
        ? form.requirements.split("\n").map((r) => r.trim()).filter(Boolean)
        : undefined,
    });
  };

  const report = evaluate.data;
  const verdictConf = report ? (VERDICT_CONFIG[report.verdict] ?? VERDICT_CONFIG.approved_with_notes) : null;
  const VerdictIcon = verdictConf?.icon ?? CheckCircle;

  const inputBase: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    color: "#e2e8f0",
    fontSize: 13,
    padding: "10px 14px",
    outline: "none",
    fontFamily: "inherit",
    lineHeight: 1.5,
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: report ? "1fr 1fr" : "1fr", gap: 24, alignItems: "start" }}>
      {/* Form */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8 }}>
          <FileCheck size={18} color="#a78bfa" />
          Submission Details
        </h3>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Task Title *
            </label>
            <input style={inputBase} value={form.task_title} onChange={(e) => setForm((f) => ({ ...f, task_title: e.target.value }))} placeholder="e.g. Implement User Authentication API" required />
          </div>

          <div>
            <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Task Description *
            </label>
            <textarea style={{ ...inputBase, resize: "none" }} rows={3} value={form.task_description} onChange={(e) => setForm((f) => ({ ...f, task_description: e.target.value }))} placeholder="Describe what was required..." required />
          </div>

          <div>
            <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Acceptance Criteria (one per line)
            </label>
            <textarea style={{ ...inputBase, resize: "none" }} rows={3} value={form.requirements} onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))} placeholder="Must have JWT auth&#10;Must have rate limiting&#10;Must have tests" />
          </div>

          <div>
            <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Submission Content *
            </label>
            <textarea style={{ ...inputBase, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} rows={8} value={form.submission_content} onChange={(e) => setForm((f) => ({ ...f, submission_content: e.target.value }))} placeholder="Paste the submission: code, documentation, description, links..." required />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="submit"
              disabled={evaluate.isPending}
              style={{
                flex: 1,
                padding: "11px 0",
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: evaluate.isPending ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: evaluate.isPending ? 0.7 : 1,
                boxShadow: "0 4px 20px rgba(124,58,237,0.3)",
              }}
            >
              <Sparkles size={15} />
              {evaluate.isPending ? "Evaluating…" : "Evaluate with AI"}
            </button>
            {report && (
              <button
                type="button"
                onClick={() => evaluate.reset()}
                style={{ padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#64748b", cursor: "pointer" }}
              >
                <RotateCcw size={15} />
              </button>
            )}
          </div>

          {evaluate.isError && (
            <div style={{ color: "#f87171", fontSize: 13, textAlign: "center" }}>
              Evaluation failed. Please try again.
            </div>
          )}
        </form>
      </div>

      {/* Report */}
      {report && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Score header */}
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: `1px solid ${verdictConf!.color}33`,
            borderRadius: 16,
            padding: 24,
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}>
            <ScoreRing score={report.overall_score} size={90} />
            <div style={{ flex: 1 }}>
              <GradeBadge grade={report.grade} />
              <div style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 20,
                background: verdictConf!.bg,
                border: `1px solid ${verdictConf!.color}33`,
                width: "fit-content",
              }}>
                <VerdictIcon size={13} color={verdictConf!.color} />
                <span style={{ fontSize: 12, fontWeight: 700, color: verdictConf!.color }}>{verdictConf!.label}</span>
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>{report.summary}</p>
            </div>
          </div>

          {/* Dimensions */}
          {Object.keys(report.dimensions).length > 0 && (
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 20 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Quality Dimensions</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {Object.entries(report.dimensions).map(([key, dim]) => {
                  const Icon = DIMENSION_ICONS[key] ?? BarChart3;
                  const scoreColor = dim.score >= 90 ? "#34d399" : dim.score >= 75 ? "#a78bfa" : dim.score >= 60 ? "#facc15" : "#f87171";
                  return (
                    <div key={key}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#cbd5e1" }}>
                          <Icon size={13} color="#64748b" />
                          <span style={{ textTransform: "capitalize" }}>{key.replace("_", " ")}</span>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor }}>{dim.score}</span>
                      </div>
                      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${dim.score}%`, background: scoreColor, borderRadius: 4, transition: "width 0.8s ease" }} />
                      </div>
                      {dim.note && <p style={{ margin: "3px 0 0", fontSize: 11, color: "#475569" }}>{dim.note}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Issues */}
          {report.issues.length > 0 && (
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 20 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Issues Found</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {report.issues.map((issue, i) => {
                  const sev = SEVERITY_CONFIG[issue.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.info;
                  const SevIcon = sev.icon;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 10, background: sev.bg, border: `1px solid ${sev.color}22` }}>
                      <SevIcon size={14} color={sev.color} style={{ flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <span style={{ fontSize: 10, color: sev.color, fontWeight: 700, textTransform: "uppercase" }}>{issue.category}</span>
                        <p style={{ margin: 0, fontSize: 13, color: "#cbd5e1" }}>{issue.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Strengths & Actions */}
          {(report.strengths.length > 0 || report.recommended_actions.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {report.strengths.length > 0 && (
                <div style={{ background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.15)", borderRadius: 12, padding: 16 }}>
                  <h4 style={{ fontSize: 12, fontWeight: 700, color: "#34d399", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 5 }}>
                    <Star size={12} />STRENGTHS
                  </h4>
                  {report.strengths.map((s, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4, paddingLeft: 8, borderLeft: "2px solid rgba(52,211,153,0.3)" }}>
                      {s}
                    </div>
                  ))}
                </div>
              )}
              {report.recommended_actions.length > 0 && (
                <div style={{ background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 12, padding: 16 }}>
                  <h4 style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 5 }}>
                    <Zap size={12} />ACTIONS
                  </h4>
                  {report.recommended_actions.map((a, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4, paddingLeft: 8, borderLeft: "2px solid rgba(167,139,250,0.3)" }}>
                      {a}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Code Reviewer ─────────────────────────────────────────────────────────────
function CodeReviewer() {
  const reviewCode = useCodeReview();
  const [form, setForm] = useState({ task_description: "", code_snippet: "", language: "python" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    reviewCode.mutate(form);
  };

  const report = reviewCode.data;

  const inputBase: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    color: "#e2e8f0",
    fontSize: 13,
    padding: "10px 14px",
    outline: "none",
    fontFamily: "inherit",
    lineHeight: 1.5,
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: report ? "1fr 1fr" : "1fr", gap: 24, alignItems: "start" }}>
      {/* Form */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8 }}>
          <Code2 size={18} color="#38bdf8" />
          Code to Review
        </h3>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Context / Task</label>
              <input style={inputBase} value={form.task_description} onChange={(e) => setForm((f) => ({ ...f, task_description: e.target.value }))} placeholder="What does this code do?" required />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Language</label>
              <select style={{ ...inputBase, cursor: "pointer" }} value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}>
                {["python", "javascript", "typescript", "go", "rust", "java", "c++", "c#", "ruby", "php"].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Code Snippet / Diff *
            </label>
            <textarea
              style={{ ...inputBase, resize: "vertical", fontFamily: "'Fira Code', 'JetBrains Mono', monospace", fontSize: 12 }}
              rows={14}
              value={form.code_snippet}
              onChange={(e) => setForm((f) => ({ ...f, code_snippet: e.target.value }))}
              placeholder="Paste your code or diff here…"
              required
            />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="submit"
              disabled={reviewCode.isPending}
              style={{
                flex: 1,
                padding: "11px 0",
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(135deg, #0891b2, #0e7490)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: reviewCode.isPending ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: reviewCode.isPending ? 0.7 : 1,
                boxShadow: "0 4px 20px rgba(8,145,178,0.3)",
              }}
            >
              <Code2 size={15} />
              {reviewCode.isPending ? "Reviewing…" : "Review Code with AI"}
            </button>
            {report && (
              <button
                type="button"
                onClick={() => reviewCode.reset()}
                style={{ padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#64748b", cursor: "pointer" }}
              >
                <RotateCcw size={15} />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Code Review Report */}
      {report && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Score */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(56,189,248,0.2)", borderRadius: 16, padding: 24, display: "flex", alignItems: "center", gap: 20 }}>
            <ScoreRing score={report.overall_score} size={90} />
            <div style={{ flex: 1 }}>
              <GradeBadge grade={report.grade} />
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>{report.summary}</p>
            </div>
          </div>

          {/* Security flags */}
          {report.security_flags.length > 0 && (
            <div style={{ background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 12, padding: 16 }}>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: "#f87171", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                <Shield size={13} />SECURITY FLAGS
              </h4>
              {report.security_flags.map((flag, i) => (
                <div key={i} style={{ fontSize: 13, color: "#fca5a5", marginBottom: 4 }}>⚠ {flag}</div>
              ))}
            </div>
          )}

          {/* Line comments */}
          {report.line_comments.length > 0 && (
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 20 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Line Comments</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {report.line_comments.map((c, i) => {
                  const sev = SEVERITY_CONFIG[c.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.info;
                  const SevIcon = sev.icon;
                  return (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 10, background: sev.bg, border: `1px solid ${sev.color}22` }}>
                      <SevIcon size={14} color={sev.color} style={{ flexShrink: 0, marginTop: 1 }} />
                      <div>
                        {c.line && <span style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>Line {c.line} · </span>}
                        <span style={{ fontSize: 13, color: "#cbd5e1" }}>{c.comment}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Complexity + Suggestions */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {Object.keys(report.complexity_analysis).length > 0 && (
              <div style={{ background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 12, padding: 16 }}>
                <h4 style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", margin: "0 0 10px", textTransform: "uppercase" }}>Complexity</h4>
                {Object.entries(report.complexity_analysis).map(([k, v]) => (
                  <div key={k} style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
                    <span style={{ color: "#64748b" }}>{k.replace(/_/g, " ")}: </span>
                    <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            {report.suggestions.length > 0 && (
              <div style={{ background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.15)", borderRadius: 12, padding: 16 }}>
                <h4 style={{ fontSize: 12, fontWeight: 700, color: "#38bdf8", margin: "0 0 10px", textTransform: "uppercase" }}>Suggestions</h4>
                {report.suggestions.map((s, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4, paddingLeft: 8, borderLeft: "2px solid rgba(56,189,248,0.3)" }}>
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function QualityEnginePage() {
  const [activeTab, setActiveTab] = useState<"submission" | "code">("submission");

  const tabs = [
    { id: "submission" as const, label: "Submission Evaluator", icon: FileCheck, color: "#a78bfa" },
    { id: "code" as const, label: "Code Reviewer", icon: Code2, color: "#38bdf8" },
  ];

  return (
    <>
      <style>{`
        textarea:focus, input:focus, select:focus {
          border-color: rgba(167,139,250,0.4) !important;
          box-shadow: 0 0 0 3px rgba(167,139,250,0.07);
        }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#080e1c", fontFamily: "'Inter', system-ui, sans-serif", color: "#e2e8f0" }}>
        {/* Header */}
        <div style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.02)",
          padding: "24px 32px 0",
        }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
                }}>
                  <Sparkles size={22} color="#fff" />
                </div>
                <div>
                  <h1 style={{ fontSize: 26, fontWeight: 900, color: "#f1f5f9", margin: 0, letterSpacing: "-0.02em" }}>
                    AI Quality Engine
                  </h1>
                  <p style={{ fontSize: 13, color: "#475569", margin: 0 }}>
                    AI-powered work evaluation and code review for remote engineering teams
                  </p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 0 }}>
              {tabs.map(({ id, label, icon: Icon, color }) => (
                <button
                  key={id}
                  id={`quality-tab-${id}`}
                  onClick={() => setActiveTab(id)}
                  style={{
                    padding: "12px 20px",
                    background: "none",
                    border: "none",
                    borderBottom: activeTab === id ? `2px solid ${color}` : "2px solid transparent",
                    color: activeTab === id ? color : "#475569",
                    fontSize: 14,
                    fontWeight: activeTab === id ? 700 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    transition: "all 0.15s",
                  }}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 32px" }}>
          {/* Feature highlights */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 28 }}>
            {[
              { icon: BarChart3, label: "Score & Grade", desc: "0–100 score with letter grade", color: "#a78bfa" },
              { icon: Shield, label: "Security Scan", desc: "Flags security vulnerabilities", color: "#f87171" },
              { icon: Activity, label: "Multi-Dimensional", desc: "6 quality dimensions analyzed", color: "#38bdf8" },
              { icon: Zap, label: "Actionable Feedback", desc: "Specific improvement actions", color: "#34d399" },
            ].map(({ icon: Icon, label, desc, color }) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12,
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={17} color={color} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{label}</div>
                  <div style={{ fontSize: 11, color: "#475569" }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>

          {activeTab === "submission" ? <SubmissionEvaluator /> : <CodeReviewer />}
        </div>
      </div>
    </>
  );
}
