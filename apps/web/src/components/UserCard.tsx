"use client";

import Link from "next/link";
import { MapPin, CheckCircle2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { MatchPill } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { EngineerProfile } from "@/types";

export function UserCard({
  profile,
  href,
  matchScore,
  actionLabel,
  onAction,
  mutualConnections,
}: {
  profile: EngineerProfile;
  href?: string;
  matchScore?: number;
  actionLabel?: string;
  onAction?: () => void;
  mutualConnections?: number;
}) {
  return (
    <div className="card-enterprise p-4 flex flex-col gap-3 group transition-all duration-150 hover:border-[var(--color-brand)]/40 hover:shadow-[var(--shadow-sm)]">
      <Link href={href ?? `/engineers/${profile.id}`} className="flex items-start gap-3.5">
        <Avatar
          name={profile.full_name}
          src={profile.avatar_url}
          size="lg"
          className="rounded-full ring-2 ring-[var(--border-color)] shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold text-[var(--text-main)] truncate group-hover:text-[var(--color-brand)] transition-colors">
              {profile.full_name}
            </p>
            {profile.is_verified && <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-brand)] shrink-0" />}
          </div>
          <p className="text-xs text-[var(--text-muted)] truncate mt-0.5 font-medium">
            {profile.headline || profile.primary_role || "Software Engineer"}
          </p>
          <div className="flex items-center gap-2 mt-1.5 text-xs text-[var(--text-muted)] flex-wrap">
            {profile.location && (
              <span className="inline-flex items-center gap-1 text-[11px]">
                <MapPin className="h-3 w-3 text-slate-400" />
                {profile.location}
              </span>
            )}
            {profile.hourly_rate ? (
              <span className="inline-flex items-center text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
                ${profile.hourly_rate}/hr
              </span>
            ) : null}
          </div>
          {typeof mutualConnections === "number" && mutualConnections > 0 && (
            <p className="text-[11px] text-[var(--text-light)] mt-1">{mutualConnections} mutual connections</p>
          )}
        </div>
      </Link>

      {profile.skills && profile.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {profile.skills.slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="text-[10px] font-medium bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-color)] px-2 py-0.5 rounded-md"
            >
              {skill}
            </span>
          ))}
          {profile.skills.length > 3 && (
            <span className="text-[10px] text-[var(--text-light)] self-center font-medium">
              +{profile.skills.length - 3}
            </span>
          )}
        </div>
      )}

      {typeof matchScore === "number" && <MatchPill score={matchScore} />}

      {actionLabel && (
        <Button size="sm" variant="secondary" fullWidth onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
