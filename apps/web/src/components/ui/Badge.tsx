import { HTMLAttributes } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

export type BadgeTone = "brand" | "success" | "warning" | "danger" | "neutral" | "ai";

const toneClasses: Record<BadgeTone, string> = {
  brand: "badge-ent badge-ent-brand",
  success: "badge-ent badge-ent-success",
  warning: "badge-ent badge-ent-warning",
  danger: "badge-ent bg-[var(--color-danger-soft)] text-[var(--color-error)]",
  neutral: "badge-ent badge-ent-neutral",
  ai: "badge-ai",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span className={cn(toneClasses[tone], "gap-1", className)} {...props}>
      {tone === "ai" && <Sparkles className="h-3 w-3" />}
      {children}
    </span>
  );
}

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const statusDot: Record<StatusTone, string> = {
  success: "bg-[var(--color-success)]",
  warning: "bg-[var(--color-warning)]",
  danger: "bg-[var(--color-error)]",
  info: "bg-[var(--color-info)]",
  neutral: "bg-slate-400",
};

const statusBg: Record<StatusTone, string> = {
  success: "badge-ent-success",
  warning: "badge-ent-warning",
  danger: "bg-[var(--color-danger-soft)] text-[var(--color-error)]",
  info: "bg-[var(--color-info-soft)] text-[var(--color-info)]",
  neutral: "badge-ent-neutral",
};

export function StatusBadge({ label, tone = "neutral", className }: { label: string; tone?: StatusTone; className?: string }) {
  return (
    <span className={cn("badge-ent inline-flex items-center gap-1.5", statusBg[tone], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", statusDot[tone])} />
      {label}
    </span>
  );
}

export function MatchPill({ score }: { score: number }) {
  const level = score >= 75 ? "high" : score >= 50 ? "mid" : "low";
  return <span className={cn("pill-match", `pill-match-${level}`)}>{Math.round(score)}% match</span>;
}
