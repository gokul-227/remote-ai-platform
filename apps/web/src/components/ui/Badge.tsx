import { HTMLAttributes } from "react";
import { Sparkles } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva("badge-ent gap-1", {
  variants: {
    tone: {
      brand: "badge-ent-brand",
      success: "badge-ent-success",
      warning: "badge-ent-warning",
      danger: "bg-[var(--color-danger-soft)] text-[var(--color-error)]",
      neutral: "badge-ent-neutral",
      ai: "badge-ai",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ tone = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span className={cn(tone === "ai" ? "badge-ai" : badgeVariants({ tone }), className)} {...props}>
      {tone === "ai" && <Sparkles className="h-3 w-3" />}
      {children}
    </span>
  );
}

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const statusDotVariants = cva("h-1.5 w-1.5 rounded-full", {
  variants: {
    tone: {
      success: "bg-[var(--color-success)]",
      warning: "bg-[var(--color-warning)]",
      danger: "bg-[var(--color-error)]",
      info: "bg-[var(--color-info)]",
      neutral: "bg-[var(--text-light)]",
    },
  },
  defaultVariants: { tone: "neutral" },
});

const statusBgVariants = cva("badge-ent inline-flex items-center gap-1.5", {
  variants: {
    tone: {
      success: "badge-ent-success",
      warning: "badge-ent-warning",
      danger: "bg-[var(--color-danger-soft)] text-[var(--color-error)]",
      info: "bg-[var(--color-info-soft)] text-[var(--color-info)]",
      neutral: "badge-ent-neutral",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function StatusBadge({ label, tone = "neutral", className }: { label: string; tone?: StatusTone; className?: string }) {
  return (
    <span className={cn(statusBgVariants({ tone }), className)}>
      <span className={statusDotVariants({ tone })} />
      {label}
    </span>
  );
}

export function MatchPill({ score }: { score: number }) {
  const level = score >= 75 ? "high" : score >= 50 ? "mid" : "low";
  return <span className={cn("pill-match", `pill-match-${level}`)}>{Math.round(score)}% match</span>;
}
