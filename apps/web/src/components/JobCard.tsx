"use client";

import Link from "next/link";
import { Clock, Bookmark, BookmarkCheck, Globe2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { MatchPill } from "@/components/ui/Badge";
import type { JobPost } from "@/types";
import { cn } from "@/lib/cn";

function formatSalary(job: JobPost) {
  const min = job.salary_min ?? job.budget_min;
  const max = job.salary_max ?? job.budget_max;
  if (!min && !max) return null;
  const sym = job.currency === "EUR" ? "€" : job.currency === "GBP" ? "£" : "$";
  const fmt = (n: number) => (n >= 1000 ? `${sym}${Math.round(n / 1000)}k` : `${sym}${n}`);
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt((min ?? max) as number);
}

function timeAgo(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function JobCard({
  job,
  saved,
  onToggleSave,
  compact,
  href,
}: {
  job: JobPost;
  saved?: boolean;
  onToggleSave?: (job: JobPost) => void;
  compact?: boolean;
  href?: string;
}) {
  const salary = formatSalary(job);

  return (
    <Link
      href={href ?? `/jobs/${job.id}`}
      className={cn(
        "card-enterprise flex gap-3.5 p-4 group transition-all duration-150 hover:border-[var(--color-brand)]/40 hover:shadow-[var(--shadow-sm)]",
        compact && "p-3"
      )}
    >
      <Avatar
        name={job.company_name || "Organization"}
        src={job.company_logo}
        size={compact ? "sm" : "md"}
        className="rounded-xl ring-1 ring-[var(--border-color)] shrink-0"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text-main)] truncate group-hover:text-[var(--color-brand)] transition-colors">
              {job.title}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-medium text-[var(--text-muted)] truncate">{job.company_name}</span>
              {job.source && job.source !== "DIRECT" && (
                <span className="text-[10px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded">
                  {job.source}
                </span>
              )}
            </div>
          </div>
          {onToggleSave && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleSave(job);
              }}
              aria-label={saved ? "Remove from saved jobs" : "Save job"}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-[var(--color-brand)] shrink-0 transition-colors"
            >
              {saved ? <BookmarkCheck className="h-4 w-4 text-[var(--color-brand)]" /> : <Bookmark className="h-4 w-4" />}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mt-2 text-xs text-[var(--text-muted)] flex-wrap">
          <span className="inline-flex items-center gap-1">
            <Globe2 className="h-3 w-3 text-slate-400" />
            {job.is_remote ? "Remote" : job.location || "Remote"}
          </span>
          {salary && (
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded text-[11px]">
              {salary}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[var(--text-light)]">
            <Clock className="h-3 w-3" />
            {timeAgo(job.posted_at)}
          </span>
        </div>

        {!compact && job.skills && job.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {job.skills.slice(0, 4).map((skill) => (
              <span
                key={skill}
                className="text-[10px] font-medium bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-color)] px-2 py-0.5 rounded-md"
              >
                {skill}
              </span>
            ))}
            {job.skills.length > 4 && (
              <span className="text-[10px] text-[var(--text-light)] self-center font-medium">
                +{job.skills.length - 4} more
              </span>
            )}
          </div>
        )}

        {typeof job.match_score === "number" && (
          <div className="mt-2.5">
            <MatchPill score={job.match_score} />
          </div>
        )}
      </div>
    </Link>
  );
}
