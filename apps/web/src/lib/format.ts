import type { JobPost } from "@/types";

const compact = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));

/** Figma-style pay line: "$165K - $210K", "$110/hr" or "" when unknown. */
export function formatPay(j: Pick<JobPost, "salary_min" | "salary_max" | "budget_min" | "budget_max" | "currency" | "job_type">): string {
  const sym = !j.currency || j.currency === "USD" ? "$" : `${j.currency} `;
  const lo = j.salary_min ?? j.budget_min;
  const hi = j.salary_max ?? j.budget_max;
  if (lo == null && hi == null) return "";
  const hourly = (hi ?? lo ?? 0) < 1000;
  const fmt = (n: number) => (hourly ? `${sym}${n}/hr` : `${sym}${compact(n)}`);
  if (lo != null && hi != null && lo !== hi) return hourly ? `${sym}${lo} - ${sym}${hi}/hr` : `${fmt(lo)} - ${fmt(hi)}`;
  return fmt((lo ?? hi) as number);
}
