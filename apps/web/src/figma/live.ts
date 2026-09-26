"use client";

/**
 * Live-data adapters for the Figma Make screens: fetch from the real API and
 * map records into the field shapes the Figma markup already reads, so the
 * screens stay visually identical while showing real data.
 */
import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";

export interface ApiJob {
  id: string; title: string; description?: string | null; company_id?: string | null; company_name?: string | null; company_logo?: string | null;
  location?: string | null; is_remote?: boolean; job_type?: string | null; experience_level?: string | null;
  salary_min?: number | null; salary_max?: number | null; budget_min?: number | null; budget_max?: number | null; currency?: string | null;
  skills?: string[]; source?: string | null; external_url?: string | null; posted_at?: string; match_score?: number;
}

/** The Figma JOBS row shape (rap_kit.tsx), plus the original API record. */
export interface FigmaJob {
  id: string; t: string; co: string; loc: string; type: string; pay: string; post: string; ap?: number; m?: number;
  easy: boolean; lvl: string; tags: string[]; raw: ApiJob;
}

const title = (s?: string | null) => (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const steps: Array<[number, string]> = [[31557600, "year"], [2629800, "month"], [604800, "week"], [86400, "day"], [3600, "hour"], [60, "minute"]];
  for (const [sec, name] of steps) if (s >= sec) { const n = Math.floor(s / sec); return `${n} ${name}${n > 1 ? "s" : ""} ago`; }
  return "just now";
}

export function formatPay(j: ApiJob): string {
  const sym = !j.currency || j.currency === "USD" ? "$" : `${j.currency} `;
  const lo = j.salary_min ?? j.budget_min, hi = j.salary_max ?? j.budget_max;
  if (lo == null && hi == null) return "";
  const hourly = (hi ?? lo ?? 0) < 1000;
  const f = (n: number) => (hourly ? `${sym}${n}/hr` : `${sym}${n >= 1000 ? Math.round(n / 1000) + "K" : n}`);
  return lo != null && hi != null && lo !== hi ? `${f(lo)} - ${f(hi)}` : f((lo ?? hi) as number);
}

export const isDirectJob = (j: ApiJob) => !j.external_url && (!j.source || j.source.toUpperCase() === "DIRECT");

export function toFigmaJob(j: ApiJob): FigmaJob {
  return {
    id: j.id, t: j.title, co: j.company_name || "Company", loc: j.location || (j.is_remote ? "Remote" : "On-site"), type: title(j.job_type) || "Full-time",
    pay: formatPay(j), post: timeAgo(j.posted_at), m: typeof j.match_score === "number" ? Math.round(j.match_score) : undefined,
    easy: isDirectJob(j), lvl: title(j.experience_level), tags: j.skills ?? [], raw: j,
  };
}

/** Minimal fetch hook (the Figma app has no query library). */
export function useApi<T>(path: string | null, params?: Record<string, unknown>) {
  const key = path ? path + JSON.stringify(params ?? {}) : null;
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: !!path });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    api.get<T>(path, { params }).then((r) => live && setState({ data: r.data, loading: false })).catch((e) => live && setState({ error: e, loading: false }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export const statusOf = (e: unknown) => (e as { response?: { status?: number } } | undefined)?.response?.status;
