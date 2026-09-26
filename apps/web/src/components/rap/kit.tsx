"use client";

/**
 * Remote AI Platform design kit — typed port of the Figma Make design's
 * rap_kit.tsx plus the v2-* page grammar. Every screen is built from these
 * primitives; styling lives in globals.css (rap-* / v2-* classes) and
 * Tailwind utilities, matching the Figma source one-to-one.
 */
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { ICON_PATHS } from "./icons";

export const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(" ");

export const BLUE = "#0866ff";

export function Ic({ n, s = 20, c = "" }: { n: string; s?: number; c?: string }) {
  const d = (ICON_PATHS[n] || ICON_PATHS.dot).split("|");
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cx("shrink-0", c)} aria-hidden="true">
      {d.map((x, i) => <path key={i} d={x} />)}
    </svg>
  );
}

const GR = ["from-blue-500 to-indigo-600", "from-emerald-500 to-teal-600", "from-rose-500 to-orange-500", "from-violet-500 to-fuchsia-600", "from-amber-500 to-orange-600", "from-cyan-500 to-blue-600", "from-slate-600 to-slate-800", "from-pink-500 to-rose-600"];
export const grad = (s: string) => GR[[...(s || "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % GR.length];

export const initials = (name: string) =>
  (name || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

/** Person avatar: photo when available, otherwise Figma's gradient initials. */
export function Av({ name, src, s = 40, dot, ring }: { name: string; src?: string | null; s?: number; dot?: boolean; ring?: boolean }) {
  return (
    <div className="relative shrink-0" style={{ width: s, height: s }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote user-supplied avatars from arbitrary hosts
        <img src={src} alt="" className={cx("h-full w-full rounded-full object-cover", ring && "ring-2 ring-[#0866ff] ring-offset-2")} />
      ) : (
        <div className={cx("flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br font-bold text-white", grad(name), ring && "ring-2 ring-[#0866ff] ring-offset-2")} style={{ fontSize: s * 0.36 }}>{initials(name)}</div>
      )}
      {dot && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />}
    </div>
  );
}

/** Organization logo: image when available, otherwise gradient monogram. */
export function Lg({ name, src, s = 48, r = 8 }: { name: string; src?: string | null; s?: number; r?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- remote company logos from arbitrary hosts
    return <img src={src} alt="" className="shrink-0 bg-white object-contain" style={{ width: s, height: s, borderRadius: r }} />;
  }
  return <div className={cx("flex shrink-0 items-center justify-center bg-gradient-to-br font-black text-white", grad(name))} style={{ width: s, height: s, borderRadius: r, fontSize: s * 0.36 }}>{(name || "?").slice(0, 2).toUpperCase()}</div>;
}

export function Brand({ s = 32 }: { s?: number }) {
  return (
    <div className="flex items-center justify-center rounded-lg bg-[#0866ff] text-white" style={{ width: s, height: s }}>
      <svg width={s * 0.62} height={s * 0.62} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18" /><path d="M17 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="currentColor" stroke="none" /></svg>
    </div>
  );
}

const BTN: Record<string, string> = {
  primary: "bg-[#0866ff] text-white hover:bg-[#0757d8]",
  outline: "border border-[#0866ff] text-[#0866ff] hover:bg-[#e7f0ff]",
  ghost: "text-slate-600 hover:bg-slate-100",
  gray: "bg-slate-200 text-slate-800 hover:bg-[#d8dadf]",
  dark: "bg-[#1c1e21] text-white hover:bg-slate-700",
  green: "bg-[#14A800] text-white hover:bg-[#108a00]",
  greenOutline: "border border-[#14A800] text-[#14A800] hover:bg-[#f1faef]",
  danger: "bg-red-600 text-white hover:bg-red-700",
  line: "border border-slate-300 text-slate-700 hover:bg-slate-50",
};
export type BtnVariant = keyof typeof BTN;

export function Btn({
  children, v = "primary", sm, onClick, icon, full, c = "", href, type = "button", disabled, loading, title,
}: {
  children?: ReactNode; v?: BtnVariant; sm?: boolean; onClick?: () => void; icon?: string; full?: boolean; c?: string;
  href?: string; type?: "button" | "submit" | "reset"; disabled?: boolean; loading?: boolean; title?: string;
}) {
  const cls = cx("inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors", BTN[v], sm ? "px-3 py-1.5 text-[13px]" : "px-4 py-2 text-[15px]", full && "w-full", c);
  const inner = <>{loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon && <Ic n={icon} s={sm ? 14 : 16} />}{children}</>;
  if (href) return <Link href={href} className={cls} title={title}>{inner}</Link>;
  return <button type={type} onClick={onClick} disabled={disabled || loading} className={cls} title={title}>{inner}</button>;
}

export function Card({ children, c = "", p = true }: { children: ReactNode; c?: string; p?: boolean }) {
  return <div className={cx("rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,.06)]", p && "p-4", c)}>{children}</div>;
}

const TAG: Record<string, string> = { gray: "bg-slate-100 text-slate-700", blue: "bg-[#e7f0ff] text-[#0757d8]", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700", indigo: "bg-[#F1EFFF] text-[#5B4BDB]", dark: "bg-slate-900 text-white" };
export type TagTone = keyof typeof TAG;
export function Tag({ children, t = "gray" }: { children: ReactNode; t?: TagTone }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", TAG[t])}>{children}</span>;
}

export function Tabs<T extends string>({ items, v, set, c = "", counts }: { items: readonly T[]; v: T; set: (x: T) => void; c?: string; counts?: Partial<Record<T, number>> }) {
  return (
    <div role="tablist" className={cx("flex gap-1 overflow-x-auto border-b border-slate-200", c)}>
      {items.map((t) => (
        <button key={t} role="tab" aria-selected={v === t} onClick={() => set(t)} className={cx("whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold", v === t ? "border-[#0866ff] text-[#0866ff]" : "border-transparent text-slate-500 hover:text-slate-800")}>
          {t}{counts?.[t] !== undefined && <span className="ml-1.5 text-xs font-normal text-slate-400">{counts[t]}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, w = "max-w-lg" }: { open: boolean; onClose: () => void; title: string; children: ReactNode; w?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx("max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl", w)} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-xl font-bold">{title}</h3><button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-slate-100"><Ic n="x" /></button></div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <div className="mt-1 font-normal">{children}</div>
      {error ? <span role="alert" className="mt-1 block text-xs font-normal text-red-600">{error}</span> : hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}
    </label>
  );
}
export const inputCls = "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#0866ff] focus:ring-2 focus:ring-[#0866ff]/20";
export const textareaCls = "w-full rounded-lg border border-slate-300 bg-white p-3 text-sm outline-none focus:border-[#0866ff] focus:ring-2 focus:ring-[#0866ff]/20";

export function Bar({ v, c = "bg-[#0866ff]" }: { v: number; c?: string }) {
  const pct = Math.max(0, Math.min(100, v));
  return <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><div className={cx("h-full rounded-full", c)} style={{ width: pct + "%" }} /></div>;
}
export function Spark({ d, c = BLUE, h = 36, w = 120 }: { d: number[]; c?: string; h?: number; w?: number }) {
  if (d.length < 2) return null;
  const mx = Math.max(...d), mn = Math.min(...d);
  const pts = d.map((y, i) => (i / (d.length - 1)) * w + "," + (h - ((y - mn) / (mx - mn || 1)) * (h - 4) - 2)).join(" ");
  return <svg width={w} height={h} aria-hidden="true"><polyline points={pts} fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" /></svg>;
}
export function Bars({ d, c = BLUE, h = 120, labels }: { d: number[]; c?: string; h?: number; labels?: string[] }) {
  const mx = Math.max(1, ...d);
  return (
    <div className="flex items-end gap-1.5" style={{ height: h }}>
      {d.map((y, i) => <div key={i} title={labels ? `${labels[i]}: ${y}` : String(y)} className="flex-1 rounded-t" style={{ height: Math.max(2, (y / mx) * 100) + "%", background: c, opacity: 0.35 + (i / d.length) * 0.65 }} />)}
    </div>
  );
}
export function Stars({ v }: { v: number }) {
  return <span className="inline-flex items-center gap-0.5 text-amber-500" aria-label={`${v.toFixed(1)} out of 5`}>{[1, 2, 3, 4, 5].map((i) => <Ic key={i} n="star" s={13} c={i <= Math.round(v) ? "fill-current" : "opacity-30"} />)}<span className="ml-1 text-xs font-semibold text-slate-600">{v.toFixed(1)}</span></span>;
}

/* ---- v2 page grammar ------------------------------------------------------ */

export function Page({ title, sub, actions, children, wide }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? undefined : "v2-page"}>
      <div className="v2-page-head">
        <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Metrics({ items }: { items: Array<[label: string, value: ReactNode]> }) {
  return <div className={cx("v2-metrics", items.length === 4 && "four")}>{items.map(([l, v]) => <div key={l} className="v2-metric"><span>{l}</span><strong>{v}</strong></div>)}</div>;
}

export type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";
export function Status({ children, tone = "success" }: { children: ReactNode; tone?: StatusTone }) {
  return <span className={cx("v2-status", tone !== "success" && tone)}>{children}</span>;
}

export function Row({ lead, title, meta, children, href }: { lead?: ReactNode; title: ReactNode; meta?: ReactNode; children?: ReactNode; href?: string }) {
  return (
    <div className="v2-row">
      {lead}
      <div className="v2-row-main">
        {href ? <Link href={href} className="font-semibold hover:underline">{title}</Link> : <b>{title}</b>}
        {meta && <p>{meta}</p>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ icon = "inbox", title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="v2-empty">
      <Ic n={icon} s={36} c="mx-auto text-slate-400" />
      <h3>{title}</h3>
      {children && <p className="mx-auto max-w-md text-sm">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading your workspace…" }: { label?: string }) {
  return <div className="rap-state" aria-live="polite" aria-busy="true"><div className="rap-spinner" /><p>{label}</p></div>;
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  return (
    <div className="rap-state" role="alert">
      <Ic n="flag" s={42} />
      <h2>Something went wrong</h2>
      <p>{message || "We couldn’t load the latest information. Please try again."}</p>
      {onRetry && <button className="rap-button" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function AccessDenied({ message, action }: { message?: string; action?: ReactNode }) {
  return (
    <div className="rap-state">
      <Ic n="lock" s={42} />
      <h2>Access restricted</h2>
      <p>{message || "Switch to the right workspace or ask the owner for access."}</p>
      {action}
    </div>
  );
}

/** Renders loading / error / empty states for a query, children when data is ready. */
export function QueryState<T>({
  q, empty, emptyTitle = "Nothing here yet", emptyIcon, emptyAction, children,
}: {
  q: { isLoading: boolean; isError: boolean; data: T | undefined; refetch: () => unknown; error?: unknown };
  empty?: (d: T) => boolean; emptyTitle?: string; emptyIcon?: string; emptyAction?: ReactNode; children: (d: T) => ReactNode;
}) {
  if (q.isLoading) return <Loading />;
  if (q.isError || q.data === undefined) return <ErrorState onRetry={() => q.refetch()} message={apiErrorMessage(q.error)} />;
  if (empty?.(q.data)) return <Empty icon={emptyIcon} title={emptyTitle} action={emptyAction} />;
  return <>{children(q.data)}</>;
}

/** Best-effort human message from an axios/FastAPI error. */
export function apiErrorMessage(e: unknown): string | undefined {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return undefined;
}

/* ---- formatting helpers --------------------------------------------------- */

export function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const units: Array<[number, string]> = [[60, "minute"], [3600, "hour"], [86400, "day"], [604800, "week"], [2629800, "month"], [31557600, "year"]];
  let out = "";
  for (let i = units.length - 1; i >= 0; i--) {
    const [sec, name] = units[i];
    if (s >= sec) { const n = Math.floor(s / sec); out = `${n} ${name}${n > 1 ? "s" : ""} ago`; break; }
  }
  return out;
}

export function money(amount?: number | string | null, currency = "USD"): string {
  const n = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString()}`;
  }
}

export const titleCase = (s?: string | null) => (s || "").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
