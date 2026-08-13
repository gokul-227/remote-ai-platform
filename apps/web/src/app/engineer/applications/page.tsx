"use client";

import { useState } from "react";
import Link from "next/link";
import { Briefcase, FileText } from "lucide-react";
import { useApplications } from "@/hooks/useApplications";
import { useTaskOffers } from "@/hooks/useProject";
import { Button } from "@/components/ui/Button";
import { StatusBadge, type StatusTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";
import { Skeleton } from "@/components/ui/Skeleton";

interface ApplicationItem {
  application: { id: string; status: string; created_at: string };
  job: { id: string; title: string; company_name: string };
}

const STATUS_TONE: Record<string, StatusTone> = {
  SUBMITTED: "info",
  APPLIED: "info",
  REVIEWING: "warning",
  SHORTLISTED: "info",
  INVITED: "info",
  ACCEPTED: "success",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Applied",
  APPLIED: "Applied",
  REVIEWING: "In Review",
  SHORTLISTED: "Shortlisted",
  INVITED: "Invited",
  ACCEPTED: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

const WITHDRAWABLE = new Set(["SUBMITTED", "APPLIED", "REVIEWING", "SHORTLISTED", "INVITED"]);

export default function ApplicationsPage() {
  const applications = useApplications(true);
  const offers = useTaskOffers(true);
  const items: ApplicationItem[] = applications.data ?? [];
  const [filter, setFilter] = useState<"all" | "active" | "closed">("all");

  const filtered = items.filter((item) => {
    if (filter === "active") return WITHDRAWABLE.has(item.application.status);
    if (filter === "closed") return !WITHDRAWABLE.has(item.application.status);
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My Applications</h1>
        <p className="text-xs text-slate-500 mt-1">Track your job applications and task offers from project teams.</p>
      </div>

      {/* Task offers */}
      <div className="card-enterprise p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Task Offers</h2>
        {offers.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
        ) : offers.isError ? (
          <p className="text-xs text-red-700">Unable to load task offers.</p>
        ) : (offers.data ?? []).length === 0 ? (
          <p className="text-xs text-slate-500">No task offers yet. These appear when a project team offers you a task.</p>
        ) : (
          <div className="space-y-2.5">
            {offers.data?.map((item) => (
              <div key={item.offer.id} className="rounded-lg border border-[var(--border-color)] p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.task.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.project.title} · {item.offer.match_score}% skill match</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge label={item.offer.status} tone={item.offer.status === "OFFERED" ? "info" : "neutral"} />
                  {item.offer.status === "OFFERED" && (
                    <>
                      <Button size="sm" onClick={() => offers.respond.mutate({ offerId: item.offer.id, status: "ACCEPTED" })} loading={offers.respond.isPending}>
                        Accept
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => offers.respond.mutate({ offerId: item.offer.id, status: "DECLINED" })} disabled={offers.respond.isPending}>
                        Decline
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Applications */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Job Applications</h2>
        </div>
        <Tabs
          items={[
            { key: "all", label: "All", count: items.length },
            { key: "active", label: "Active", count: items.filter((i) => WITHDRAWABLE.has(i.application.status)).length },
            { key: "closed", label: "Closed", count: items.filter((i) => !WITHDRAWABLE.has(i.application.status)).length },
          ]}
          active={filter}
          onChange={(k) => setFilter(k as typeof filter)}
        />

        {applications.isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
        ) : applications.isError ? (
          <div className="card-enterprise p-6 text-center space-y-2">
            <p className="text-sm text-red-700">Unable to load applications.</p>
            <Button size="sm" variant="secondary" onClick={() => applications.refetch()}>Retry</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card-enterprise">
            <EmptyState
              icon={FileText}
              title="No applications yet"
              description="You haven't applied to any opportunities yet. Explore the marketplace to find your next remote role."
              actionLabel="Browse Jobs"
              actionHref="/jobs"
            />
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => {
              const canWithdraw = WITHDRAWABLE.has(item.application.status);
              return (
                <div key={item.application.id} className="card-enterprise flex items-center justify-between gap-4 p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <Briefcase className="h-4 w-4 text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <Link href={`/jobs/${item.job.id}`} className="font-semibold text-slate-900 text-sm hover:text-[#0A66C2] truncate block">
                        {item.job.title}
                      </Link>
                      <p className="text-xs text-slate-500 mt-0.5">{item.job.company_name}</p>
                      <div className="mt-1.5">
                        <StatusBadge label={STATUS_LABEL[item.application.status] ?? item.application.status} tone={STATUS_TONE[item.application.status] ?? "neutral"} />
                      </div>
                    </div>
                  </div>
                  {canWithdraw && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="shrink-0"
                      loading={applications.withdraw.isPending}
                      onClick={() => applications.withdraw.mutate(item.application.id)}
                    >
                      Withdraw
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
