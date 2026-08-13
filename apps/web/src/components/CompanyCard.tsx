"use client";

import Link from "next/link";
import { MapPin, Briefcase } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { CompanyProfile } from "@/types";

export function CompanyCard({
  company,
  openRoles,
  href,
}: {
  company: CompanyProfile;
  openRoles?: number;
  href?: string;
}) {
  return (
    <Link href={href ?? `/companies/${company.id}`} className="card-enterprise flex items-start gap-3 p-4 group">
      <Avatar name={company.company_name} src={company.logo_url} size="lg" className="rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--text-main)] truncate group-hover:text-[var(--color-brand)]">
          {company.company_name}
        </p>
        <p className="text-xs text-[var(--text-light)] truncate mt-0.5">{company.industry}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-[var(--text-light)]">
          {company.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {company.location}
            </span>
          )}
          {typeof openRoles === "number" && (
            <span className="inline-flex items-center gap-1">
              <Briefcase className="h-3 w-3" />
              {openRoles} open role{openRoles === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
