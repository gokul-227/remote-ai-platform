"use client";

import Link from "next/link";
import { MapPin, Briefcase, CheckCircle2, ArrowRight } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { CompanyProfile } from "@/types";
import { cn } from "@/lib/cn";

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
    <Link
      href={href ?? `/companies/${company.id}`}
      className={cn(
        "card-enterprise flex items-start gap-3.5 p-4 group transition-all duration-150 hover:border-[var(--color-brand)]/40 hover:shadow-[var(--shadow-sm)]"
      )}
    >
      <Avatar
        name={company.company_name}
        src={company.logo_url}
        size="lg"
        className="rounded-xl ring-1 ring-[var(--border-color)] shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-bold text-[var(--text-main)] truncate group-hover:text-[var(--color-brand)] transition-colors">
            {company.company_name}
          </p>
          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-brand)] shrink-0" />
        </div>
        <p className="text-xs text-[var(--text-muted)] truncate mt-0.5 font-medium">
          {company.industry || "Technology"}
        </p>
        <div className="flex items-center gap-3 mt-2 text-xs text-[var(--text-muted)] flex-wrap">
          {company.location && (
            <span className="inline-flex items-center gap-1 text-[11px]">
              <MapPin className="h-3 w-3 text-slate-400" />
              {company.location}
            </span>
          )}
          {typeof openRoles === "number" && openRoles > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-brand)] bg-[var(--color-brand-light)] px-1.5 py-0.5 rounded">
              <Briefcase className="h-3 w-3" />
              {openRoles} open role{openRoles === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-[var(--color-brand)] group-hover:translate-x-0.5 transition-all shrink-0 self-center" />
    </Link>
  );
}
