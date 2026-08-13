"use client";

import Link from "next/link";
import { MapPin, Clock, Bookmark, BookmarkCheck } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, MatchPill } from "@/components/ui/Badge";
import type { JobPost } from "@/types";
import { cn } from "@/lib/cn";

function formatSalary(job: JobPost) {
  const min = job.salary_min ?? job.budget_min;
  const max = job.salary_max ?? job.budget_max;
  if (!min && !max) return null;
  const fmt = (n: number) => `${job.currency === "USD" ? "$" : job.currency + " "}${Math.round(n / 1000)}k`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt((min ?? max) as number);
}

function timeAgo(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
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
        "card-enterprise flex gap-3 p-4 group transition-shadow hover:shadow-[var(--shadow-sm)]",
        compact && "p-3"
      )}
    >
      <Avatar name={job.company_name || "Company"} src={job.company_logo} size={compact ? "sm" : "md"} className="rounded-lg" />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text-main)] truncate group-hover:text-[var(--color-brand)]">
              {job.title}
            </h3>
            <p className="text-xs text-[var(--text-light)] mt-0.5 truncate">{job.company_name}</p>
          </div>
          {onToggleSave && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleSave(job);
              }}
              aria-label={saved ? "Remove from saved jobs" : "Save job"}
              className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-[var(--color-brand)] shrink-0"
            >
              {saved ? <BookmarkCheck className="h-4 w-4 text-[var(--color-brand)]" /> : <Bookmark className="h-4 w-4" />}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mt-2 text-xs text-[var(--text-light)] flex-wrap">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {job.is_remote ? "Remote" : job.location || "Remote"}
          </span>
          {salary && <span className="font-medium text-[var(--text-main)]">{salary}</span>}
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeAgo(job.posted_at)}
          </span>
        </div>

        {!compact && job.skills?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {job.skills.slice(0, 4).map((skill) => (
              <Badge key={skill} tone="neutral">
                {skill}
              </Badge>
            ))}
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
