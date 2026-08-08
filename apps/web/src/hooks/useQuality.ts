import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";

export interface QualityIssue {
  severity: "critical" | "warning" | "info";
  category: string;
  description: string;
}

export interface SubmissionQualityReport {
  overall_score: number;
  grade: string;
  verdict: "approved" | "approved_with_notes" | "revision_required" | "rejected";
  summary: string;
  dimensions: Record<string, { score: number; note: string }>;
  issues: QualityIssue[];
  strengths: string[];
  recommended_actions: string[];
  requires_revision: boolean;
  revision_notes: string | null;
}

export interface LineComment {
  line: number | null;
  severity: string;
  comment: string;
}

export interface CodeReviewReport {
  overall_score: number;
  grade: string;
  verdict: string;
  summary: string;
  line_comments: LineComment[];
  security_flags: string[];
  complexity_analysis: Record<string, string>;
  suggestions: string[];
  requires_revision: boolean;
}

export function useEvaluateSubmission() {
  return useMutation<
    SubmissionQualityReport,
    Error,
    { task_title: string; task_description: string; submission_content: string; requirements?: string[] }
  >({
    mutationFn: (data) => api.post("/quality/evaluate", data).then((r: { data: SubmissionQualityReport }) => r.data),
  });
}

export function useCodeReview() {
  return useMutation<
    CodeReviewReport,
    Error,
    { task_description: string; code_snippet: string; language: string }
  >({
    mutationFn: (data) => api.post("/quality/review-code", data).then((r: { data: CodeReviewReport }) => r.data),
  });
}

