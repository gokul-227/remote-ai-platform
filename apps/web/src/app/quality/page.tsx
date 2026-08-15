"use client";

import { useState } from "react";
import {
  Sparkles, Code2, FileCheck, AlertTriangle, XCircle, Info,
  Star, Shield, Zap, BookOpen, Activity, RotateCcw, BarChart3,
} from "lucide-react";
import {
  useEvaluateSubmission,
  useCodeReview,
} from "@/hooks/useQuality";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { Badge, StatusBadge, type StatusTone, type BadgeTone } from "@/components/ui/Badge";
import { ProgressRing, Progress } from "@/components/ui/Progress";
import { Tabs } from "@/components/ui/Tabs";
import { cn } from "@/lib/cn";
import { RequireAuth } from "@/components/RequireAuth";

const VERDICT_TONE: Record<string, StatusTone> = {
  approved: "success",
  approved_with_notes: "warning",
  revision_required: "warning",
  rejected: "danger",
};
const VERDICT_LABEL: Record<string, string> = {
  approved: "Approved",
  approved_with_notes: "Approved with Notes",
  revision_required: "Revision Required",
  rejected: "Rejected",
};
const SEVERITY_TONE: Record<string, BadgeTone> = { critical: "danger", warning: "warning", info: "brand" };
const SEVERITY_ICON: Record<string, React.ElementType> = { critical: XCircle, warning: AlertTriangle, info: Info };

const DIMENSION_ICONS: Record<string, React.ElementType> = {
  completeness: FileCheck,
  code_quality: Code2,
  documentation: BookOpen,
  testing: Activity,
  security: Shield,
  performance: Zap,
};

function scoreTone(score: number): "success" | "brand" | "warning" {
  if (score >= 90) return "success";
  if (score >= 60) return "brand";
  return "warning";
}

function GradeBadge({ grade }: { grade: string }) {
  const tone: StatusTone = grade.startsWith("A") ? "success" : grade.startsWith("B") ? "info" : grade.startsWith("C") ? "warning" : "danger";
  return <StatusBadge label={grade} tone={tone} className="text-base px-3 py-1" />;
}

function SubmissionEvaluator() {
  const evaluate = useEvaluateSubmission();
  const [form, setForm] = useState({ task_title: "", task_description: "", submission_content: "", requirements: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    evaluate.mutate({
      task_title: form.task_title,
      task_description: form.task_description,
      submission_content: form.submission_content,
      requirements: form.requirements ? form.requirements.split("\n").map((r) => r.trim()).filter(Boolean) : undefined,
    });
  };

  const report = evaluate.data;

  return (
    <div className={cn("grid gap-6 items-start", report ? "lg:grid-cols-2" : "grid-cols-1")}>
      <div className="card-enterprise p-6">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-5">
          <FileCheck className="h-4 w-4 text-[var(--color-ai)]" /> Submission Details
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Task Title" required value={form.task_title} onChange={(e) => setForm((f) => ({ ...f, task_title: e.target.value }))} placeholder="e.g. Implement User Authentication API" />
          <Textarea label="Task Description" required rows={3} value={form.task_description} onChange={(e) => setForm((f) => ({ ...f, task_description: e.target.value }))} placeholder="Describe what was required..." />
          <Textarea label="Acceptance Criteria" hint="One per line" rows={3} value={form.requirements} onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))} placeholder={"Must have JWT auth\nMust have rate limiting\nMust have tests"} />
          <Textarea label="Submission Content" required rows={8} className="font-mono text-xs" value={form.submission_content} onChange={(e) => setForm((f) => ({ ...f, submission_content: e.target.value }))} placeholder="Paste the submission: code, documentation, description, links..." />

          <div className="flex gap-2">
            <Button type="submit" fullWidth loading={evaluate.isPending} icon={<Sparkles className="h-4 w-4" />}>Evaluate with AI</Button>
            {report && <Button type="button" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => evaluate.reset()} />}
          </div>
          {evaluate.isError && <p className="text-sm text-red-600 text-center">Evaluation failed. Please try again.</p>}
        </form>
      </div>

      {report && (
        <div className="space-y-4">
          <div className="card-enterprise p-6 flex items-center gap-5">
            <ProgressRing value={report.overall_score} size={90} />
            <div className="flex-1">
              <GradeBadge grade={report.grade} />
              <div className="mt-2.5">
                <StatusBadge label={VERDICT_LABEL[report.verdict] ?? report.verdict} tone={VERDICT_TONE[report.verdict] ?? "neutral"} />
              </div>
              <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">{report.summary}</p>
            </div>
          </div>

          {Object.keys(report.dimensions).length > 0 && (
            <div className="card-enterprise p-5 space-y-3">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Quality Dimensions</h4>
              {Object.entries(report.dimensions).map(([key, dim]) => {
                const Icon = DIMENSION_ICONS[key] ?? BarChart3;
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="flex items-center gap-1.5 text-sm text-slate-700 capitalize"><Icon className="h-3.5 w-3.5 text-slate-400" />{key.replace(/_/g, " ")}</span>
                      <span className="text-sm font-bold text-slate-900">{dim.score}</span>
                    </div>
                    <Progress value={dim.score} tone={scoreTone(dim.score) === "brand" ? "brand" : scoreTone(dim.score)} />
                    {dim.note && <p className="text-xs text-slate-400 mt-1">{dim.note}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {report.issues.length > 0 && (
            <div className="card-enterprise p-5 space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Issues Found</h4>
              {report.issues.map((issue, i) => {
                const SevIcon = SEVERITY_ICON[issue.severity] ?? Info;
                return (
                  <div key={i} className="flex items-start gap-2.5 p-3 rounded-lg border border-[var(--border-color)]">
                    <SevIcon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" />
                    <div>
                      <Badge tone={SEVERITY_TONE[issue.severity] ?? "neutral"}>{issue.category}</Badge>
                      <p className="text-sm text-slate-600 mt-1">{issue.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {(report.strengths.length > 0 || report.recommended_actions.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-3">
              {report.strengths.length > 0 && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                  <h4 className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5 mb-2"><Star className="h-3 w-3" />Strengths</h4>
                  {report.strengths.map((s, i) => <p key={i} className="text-xs text-slate-600 mb-1 pl-2 border-l-2 border-emerald-200">{s}</p>)}
                </div>
              )}
              {report.recommended_actions.length > 0 && (
                <div className="rounded-xl border border-[var(--color-brand-light)] bg-[var(--color-brand-light)] p-4">
                  <h4 className="text-xs font-semibold text-[var(--color-brand)] flex items-center gap-1.5 mb-2"><Zap className="h-3 w-3" />Actions</h4>
                  {report.recommended_actions.map((a, i) => <p key={i} className="text-xs text-slate-600 mb-1 pl-2 border-l-2 border-blue-200">{a}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CodeReviewer() {
  const reviewCode = useCodeReview();
  const [form, setForm] = useState({ task_description: "", code_snippet: "", language: "python" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    reviewCode.mutate(form);
  };

  const report = reviewCode.data;

  return (
    <div className={cn("grid gap-6 items-start", report ? "lg:grid-cols-2" : "grid-cols-1")}>
      <div className="card-enterprise p-6">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-5">
          <Code2 className="h-4 w-4 text-[var(--color-info)]" /> Code to Review
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <Input label="Context / Task" required value={form.task_description} onChange={(e) => setForm((f) => ({ ...f, task_description: e.target.value }))} placeholder="What does this code do?" />
            <Select label="Language" value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}>
              {["python", "javascript", "typescript", "go", "rust", "java", "c++", "c#", "ruby", "php"].map((l) => <option key={l} value={l}>{l}</option>)}
            </Select>
          </div>
          <Textarea label="Code Snippet / Diff" required rows={14} className="font-mono text-xs" value={form.code_snippet} onChange={(e) => setForm((f) => ({ ...f, code_snippet: e.target.value }))} placeholder="Paste your code or diff here…" />
          <div className="flex gap-2">
            <Button type="submit" fullWidth loading={reviewCode.isPending} icon={<Code2 className="h-4 w-4" />}>Review Code with AI</Button>
            {report && <Button type="button" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => reviewCode.reset()} />}
          </div>
        </form>
      </div>

      {report && (
        <div className="space-y-4">
          <div className="card-enterprise p-6 flex items-center gap-5">
            <ProgressRing value={report.overall_score} size={90} />
            <div className="flex-1">
              <GradeBadge grade={report.grade} />
              <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">{report.summary}</p>
            </div>
          </div>

          {report.security_flags.length > 0 && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4">
              <h4 className="text-xs font-semibold text-red-700 flex items-center gap-1.5 mb-2"><Shield className="h-3.5 w-3.5" />Security Flags</h4>
              {report.security_flags.map((flag, i) => <p key={i} className="text-sm text-red-700 mb-1">⚠ {flag}</p>)}
            </div>
          )}

          {report.line_comments.length > 0 && (
            <div className="card-enterprise p-5 space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Line Comments</h4>
              {report.line_comments.map((c, i) => {
                const SevIcon = SEVERITY_ICON[c.severity] ?? Info;
                return (
                  <div key={i} className="flex gap-2.5 p-3 rounded-lg border border-[var(--border-color)]">
                    <SevIcon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" />
                    <div className="text-sm text-slate-600">
                      {c.line && <span className="text-xs text-slate-400 font-mono">Line {c.line} · </span>}
                      {c.comment}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            {Object.keys(report.complexity_analysis).length > 0 && (
              <div className="rounded-xl border border-[var(--color-brand-light)] bg-[var(--color-brand-light)] p-4">
                <h4 className="text-xs font-semibold text-[var(--color-brand)] uppercase mb-2">Complexity</h4>
                {Object.entries(report.complexity_analysis).map(([k, v]) => (
                  <p key={k} className="text-xs text-slate-600 mb-1"><span className="text-slate-400">{k.replace(/_/g, " ")}: </span><span className="font-semibold capitalize">{v}</span></p>
                ))}
              </div>
            )}
            {report.suggestions.length > 0 && (
              <div className="rounded-xl border border-sky-100 bg-sky-50 p-4">
                <h4 className="text-xs font-semibold text-sky-700 uppercase mb-2">Suggestions</h4>
                {report.suggestions.map((s, i) => <p key={i} className="text-xs text-slate-600 mb-1 pl-2 border-l-2 border-sky-200">{s}</p>)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function QualityEngineContent() {
  const [activeTab, setActiveTab] = useState<"submission" | "code">("submission");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-[var(--color-ai-soft)] flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5 text-[var(--color-ai)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">AI Quality Engine</h1>
          <p className="text-xs text-slate-500 mt-0.5">AI-powered work evaluation and code review for remote engineering teams.</p>
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {[
          { icon: BarChart3, label: "Score & Grade", desc: "0–100 score with letter grade" },
          { icon: Shield, label: "Security Scan", desc: "Flags security vulnerabilities" },
          { icon: Activity, label: "Multi-Dimensional", desc: "6 quality dimensions analyzed" },
          { icon: Zap, label: "Actionable Feedback", desc: "Specific improvement actions" },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="card-enterprise p-3.5 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[var(--color-ai-soft)] flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-[var(--color-ai)]" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-900">{label}</div>
              <div className="text-[11px] text-slate-400">{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <Tabs
        items={[
          { key: "submission", label: "Submission Evaluator" },
          { key: "code", label: "Code Reviewer" },
        ]}
        active={activeTab}
        onChange={(k) => setActiveTab(k as typeof activeTab)}
      />

      {activeTab === "submission" ? <SubmissionEvaluator /> : <CodeReviewer />}
    </div>
  );
}

export default function QualityEnginePage() {
  return (
    <RequireAuth>
      <QualityEngineContent />
    </RequireAuth>
  );
}
