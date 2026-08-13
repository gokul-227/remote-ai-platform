"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, MatchPill } from "@/components/ui/Badge";
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
    <div className="card-enterprise p-4 flex flex-col gap-3">
      <Link href={href ?? `/engineers/${profile.id}`} className="flex items-start gap-3 group">
        <Avatar name={profile.full_name} src={profile.avatar_url} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-main)] truncate group-hover:text-[var(--color-brand)]">
            {profile.full_name}
          </p>
          <p className="text-xs text-[var(--text-light)] truncate mt-0.5">{profile.headline || profile.primary_role}</p>
          {profile.location && (
            <p className="text-xs text-[var(--text-light)] flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3" />
              {profile.location}
            </p>
          )}
          {typeof mutualConnections === "number" && mutualConnections > 0 && (
            <p className="text-xs text-[var(--text-light)] mt-1">{mutualConnections} mutual connections</p>
          )}
        </div>
      </Link>

      {profile.skills && profile.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {profile.skills.slice(0, 3).map((skill) => (
            <Badge key={skill} tone="neutral">
              {skill}
            </Badge>
          ))}
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
