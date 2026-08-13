import { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center gap-2 py-12 px-6", className)}>
      {Icon && (
        <div className="h-12 w-12 rounded-full bg-[var(--bg-subtle)] flex items-center justify-center mb-1">
          <Icon className="h-6 w-6 text-[var(--text-light)]" />
        </div>
      )}
      <p className="text-sm font-semibold text-[var(--text-main)]">{title}</p>
      {description && <p className="text-sm text-[var(--text-light)] max-w-sm">{description}</p>}
      {actionLabel && actionHref && (
        <Link href={actionHref} className="btn-primary-brand mt-3">
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-primary-brand mt-3">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
