"use client";

/**
 * Live-data adapters for the Figma Make screens: fetch from the real API and
 * map records into the field shapes the Figma markup already reads, so the
 * screens stay visually identical while showing real data.
 */
import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";

export interface ApiJob {
  id: string;
  title: string;
  description?: string | null;
  company_id?: string | null;
  company_name?: string | null;
  company_logo?: string | null;
  location?: string | null;
  is_remote?: boolean;
  job_type?: string | null;
  experience_level?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_period?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  currency?: string | null;
  skills?: string[];
  source?: string | null;
  external_url?: string | null;
  posted_at?: string;
  expired_at?: string | null;
  match_score?: number;
}

/** The Figma JOBS row shape (rap_kit.tsx), plus the original API record. */
export interface FigmaJob {
  id: string;
  t: string;
  co: string;
  loc: string;
  type: string;
  pay: string;
  post: string;
  ap?: number;
  m?: number;
  easy: boolean;
  lvl: string;
  tags: string[];
  raw: ApiJob;
}

const title = (s?: string | null) => (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

export function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const steps: Array<[number, string]> = [
    [31557600, "year"],
    [2629800, "month"],
    [604800, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [sec, name] of steps)
    if (s >= sec) {
      const n = Math.floor(s / sec);
      return `${n} ${name}${n > 1 ? "s" : ""} ago`;
    }
  return "just now";
}

const PERIOD: Record<string, string> = { year: "/yr", month: "/mo", hour: "/hr", project: " project" };

/** Pay as the source states it. The period is shown only when the source gives one; never guessed from the amount. */
export function formatPay(j: ApiJob): string {
  const salary = j.salary_min != null || j.salary_max != null;
  const lo = salary ? j.salary_min : j.budget_min,
    hi = salary ? j.salary_max : j.budget_max;
  if (lo == null && hi == null) return "";
  const sym = !j.currency || j.currency === "USD" ? "$" : `${j.currency} `;
  const f = (n: number) => `${sym}${n >= 10000 ? Math.round(n / 1000) + "K" : n.toLocaleString()}`;
  const amount = lo != null && hi != null && lo !== hi ? `${f(lo)} - ${f(hi)}` : f((lo ?? hi) as number);
  const suffix = salary ? (PERIOD[j.salary_period ?? ""] ?? "") : " budget";
  return amount + suffix;
}

export const isDirectJob = (j: ApiJob) => !j.external_url && (!j.source || j.source.toUpperCase() === "DIRECT");

export function toFigmaJob(j: ApiJob): FigmaJob {
  return {
    id: j.id,
    t: j.title,
    co: j.company_name || "Company",
    loc: j.location || (j.is_remote ? "Remote" : "On-site"),
    type: j.job_type && j.job_type !== "unspecified" ? sentence(j.job_type) : "",
    pay: formatPay(j),
    post: timeAgo(j.posted_at),
    m: typeof j.match_score === "number" ? Math.round(j.match_score) : undefined,
    easy: isDirectJob(j),
    lvl: title(j.experience_level),
    tags: j.skills ?? [],
    raw: j,
  };
}

/**
 * A link from user or third-party data, only if it is http(s); otherwise
 * undefined, so javascript:/data: URLs never reach an href, src or window.open.
 * (The API rejects them on input; this covers anything stored earlier.)
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

const RETURN_KEY = "rap-return-to";
export const AUTH_ROUTES = ["login", "register", "forgot", "reset", "callback"];

/** Remember the page a visitor was on when they were sent to sign in. */
export function rememberReturnTo(route: string) {
  if (!route || AUTH_ROUTES.includes(route.split("/")[0])) return;
  try {
    sessionStorage.setItem(RETURN_KEY, route);
  } catch {
    // Storage unavailable: they land on their home page instead.
  }
}

/** Where to go after signing in: the remembered page (once), else `fallback`. */
export function takeReturnTo(fallback: string): string {
  try {
    const route = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    // Only a plain hash route of this app (name + optional id); never a URL.
    if (route && /^[a-z0-9]+(\/[A-Za-z0-9%._-]+)?$/.test(route) && !AUTH_ROUTES.includes(route.split("/")[0])) {
      return route;
    }
  } catch {
    // fall through
  }
  return fallback;
}

/** Navigate the hash router. Kept in one place so components never write window state directly. */
export function goRoute(route: string) {
  window.location.hash = route;
}

/** Minimal fetch hook (the Figma app has no query library). */
export function useApi<T>(path: string | null, params?: Record<string, unknown>) {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  // A resource is who is asking + what; data is only ever shown for the
  // current resource, so switching resource or account never shows the
  // previous one's (possibly private) content, even if the new request fails.
  // A request is the resource + reload tick; reloading the same resource
  // keeps its data on screen while refreshing.
  const resKey = path ? `${user?.id ?? "anon"}|${path}${JSON.stringify(params ?? {})}` : null;
  const reqKey = resKey ? `${resKey}#${tick}` : null;
  const [state, setState] = useState<{
    req?: string | null;
    res?: string | null;
    data?: T;
    total?: number;
    error?: unknown;
  }>({});
  useEffect(() => {
    if (!path) return;
    let live = true;
    api
      .get<T>(path, { params })
      .then((r) => {
        if (!live) return;
        // Paginated endpoints report the full match count in X-Total-Count.
        const header = r.headers?.["x-total-count"];
        setState({ req: reqKey, res: resKey, data: r.data, total: header != null ? Number(header) : undefined });
      })
      .catch(
        (e) =>
          live &&
          setState((s) =>
            s.res === resKey ? { ...s, req: reqKey, error: e } : { req: reqKey, res: resKey, error: e },
          ),
      );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const current = !!resKey && state.res === resKey;
  return {
    data: current ? state.data : undefined,
    total: current ? state.total : undefined,
    error: state.req === reqKey ? state.error : undefined,
    loading: !!path && state.req !== reqKey,
    reload,
  };
}

export const statusOf = (e: unknown) => (e as { response?: { status?: number } } | undefined)?.response?.status;
